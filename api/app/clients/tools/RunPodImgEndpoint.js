// Generates image using stable diffusion webui's api (automatic1111)
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Tool } = require('langchain/tools');

const RUNPOD_IMG_MODELS = {
  STABLE_DIFFUSION_V1: 'stable-diffusion-v1',
  STABLE_DIFFUSION_V2: 'stable-diffusion-v2',
  ANYTHING_V3: 'anything-v3',
  ANYTHING_V4: 'anything-v4',
  OPENJOURNEY: 'openjourney-sd-v15',
  DREAMBOOTH: 'dreambooth-sd-v15',
  KANDINSKY_2: 'kandinsky-21',
};

class RundPodImgEndpointAPI extends Tool {
  constructor(fields) {
    super();
    this.name = 'runpod-endpoint';
    this.url = fields.RUNPOD_ENDPOINT_URL || this.getServerURL();
    this.apiKey = fields.RUNPOD_API_KEY || this.getApiKey();
    this.useSync = fields.RUNPOD_USE_SYNC || this.getRunPodUseSync();
    this.headers = this.getHeaders(this.apiKey);
    this.description = `You can generate images with 'runpod-endpoint'. This tool is exclusively for visual content.
Guidelines:
- Visually describe the moods, details, structures, styles, and/or proportions of the image. Remember, the focus is on visual attributes.
- Craft your input by "showing" and not "telling" the imagery. Think in terms of what you'd want to see in a photograph or a painting.
- It's best to follow this format for image creation:
"detailed keywords to describe the subject, separated by comma | keywords we want to exclude from the final image"
- Here's an example prompt for generating a realistic portrait photo of a man:
"photo of a man in black clothes, half body, high detailed skin, coastline, overcast weather, wind, waves, 8k uhd, dslr, soft lighting, high quality, film grain, Fujifilm XT3 | semi-realistic, cgi, 3d, render, sketch, cartoon, drawing, anime, out of frame, low quality, ugly, mutation, deformed"
- Generate images only once per human query unless explicitly requested by the user`;
  }

  replaceNewLinesWithSpaces(inputString) {
    return inputString.replace(/\r\n|\r|\n/g, ' ');
  }

  getMarkdownImageUrl(imageName) {
    const imageUrl = path.join(this.relativeImageUrl, imageName).replace(/\\/g, '/').replace('public/', '');
    return `![generated image](/${imageUrl})`;
  }

  getServerURL() {
    const url = process.env.RUNPOD_ENDPOINT_URL || '';
    if (!url) {
      throw new Error('Missing RUNPOD_ENDPOINT_URL environment variable.');
    }
    return url;
  }

  getRunPodUseSync() {
    const flag = process.env.RUNPOD_USE_SYNC || false;
    if (!flag) {
      throw new Error('Missing RUNPOD_USE_SYNC environment variable.');
    }
    return flag;
  }

  getApiKey() {
    const key = process.env.RUNPOD_API_KEY || '';
    if (!key) {
      throw new Error('Missing RUNPOD_API_KEY environment variable.');
    }
    return key;
  }

  getHeaders(apiKey) {
    const headers = apiKey ? {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey
    } : {};
    return headers;
  }

  // exclude status retrieval url
  getTxt2ImgUrl(url, model) {
    return `${url}/${model}}/${this.useSync || model===RUNPOD_IMG_MODELS.DREAMBOOTH ? 'run' : 'runsync'}}`;
  }

  getTxt2ImgHeaders() {
    return this.headers;
  }

  getTxt2ImgPayload(prompts, model) {
    if (model === RUNPOD_IMG_MODELS.STABLE_DIFFUSION_V2)
      return {
        input: {
          prompt: prompts.split('|')[0],
          negative_prompt: prompts.split('|')[1],
          height: 512,
          width: 512,
          num_outputs: 1,
          num_inference_steps: 20
        }
      };
    else if (model === RUNPOD_IMG_MODELS.STABLE_DIFFUSION_V1)
      return {
        input: {
          prompt: prompts.split('|')[0],
          negative_prompt: prompts.split('|')[1],
          height: 512,
          width: 512,
          num_outputs: 1,
          guidance_scale: 7.5,
          num_inference_steps: 20
        }
      };
  }

  getStatusUrl(url,model, jobId){
    return `${url}/${model}}/status/${jobId}`;
  }

  async _call(input) {
    const url = this.url;
    const model = input && input.model && Object.values(RUNPOD_IMG_MODELS).includes(input.model) ?
      input.model : RUNPOD_IMG_MODELS.STABLE_DIFFUSION_V2;
    const response = await axios.post(this.getTxt2ImgUrl(url, model),
      this.getTxt2ImgPayload(input.prompts, model),
      { headers: this.getTxt2ImgHeaders() }
    );
    //TODO: run vs runsync
    let rst = '' | undefined;
    if (response.status === 200) {
      if (response.data && response.data.output) {
        rst = response.data.output[0].image;
      } else {
        // just id and status
        rst = response.data;
      }
    }

    // Generate unique name
    const imageName = `${Date.now()}.png`;
    this.outputPath = path.resolve(__dirname, '..', '..', '..', '..', 'client', 'public', 'images');
    const appRoot = path.resolve(__dirname, '..', '..', '..', '..', 'client');
    this.relativeImageUrl = path.relative(appRoot, this.outputPath);

    // Check if directory exists, if not create it
    if (!fs.existsSync(this.outputPath)) {
      fs.mkdirSync(this.outputPath, { recursive: true });
    }

    try {
      const filepath = this.outputPath + '/' + imageName;
      downloadImage(rst, filepath);
      this.result = this.getMarkdownImageUrl(imageName);
    } catch (error) {
      console.error('Error while saving the image:', error);
    }

    return this.result;
  }
}

async function downloadImage(imageUrl, filePath) {
  try {
    const response = await axios({
      method: 'get',
      url: imageUrl,
      responseType: 'stream',
    });

    const writer = fs.createWriteStream(filePath);

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

  } catch (error) {
    console.error(error);
  }
}

module.exports = RundPodImgEndpointAPI;
