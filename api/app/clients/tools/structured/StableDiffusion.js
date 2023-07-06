// Generates image using stable diffusion webui's api (automatic1111)
const fs = require('fs');
const { StructuredTool } = require('langchain/tools');
const { z } = require('zod');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');

class StableDiffusionAPI extends StructuredTool {
  constructor(fields) {
    super();
    this.name = 'stable-diffusion';
    this.url = fields.SD_WEBUI_URL || this.getServerURL();
    this.apiKey = fields.SD_WEBUI_API_KEY || this.getApiKey();
    this.headers = this.getHeaders(this.apiKey);
    this.needPngMetadata = fields.SD_WEBUI_NEED_PNG_METADATA || this.needPngMetadata();
    this.description = `You can generate images with 'stable-diffusion'. This tool is exclusively for visual content.
Guidelines:
- Visually describe the moods, details, structures, styles, and/or proportions of the image. Remember, the focus is on visual attributes.
- Craft your input by "showing" and not "telling" the imagery. Think in terms of what you'd want to see in a photograph or a painting.
- Here's an example for generating a realistic portrait photo of a man:
"prompt":"photo of a man in black clothes, half body, high detailed skin, coastline, overcast weather, wind, waves, 8k uhd, dslr, soft lighting, high quality, film grain, Fujifilm XT3"
"negative_prompt":"semi-realistic, cgi, 3d, render, sketch, cartoon, drawing, anime, out of frame, low quality, ugly, mutation, deformed"
- Generate images only once per human query unless explicitly requested by the user`;
    this.schema = z.object({
      prompt: z.string().describe("Detailed keywords to describe the subject, using at least 7 keywords to accurately describe the image, separated by comma"),
      negative_prompt: z.string().describe("Keywords we want to exclude from the final image, using at least 7 keywords to accurately describe the image, separated by comma")
    });
  }

  replaceNewLinesWithSpaces(inputString) {
    return inputString.replace(/\r\n|\r|\n/g, ' ');
  }

  getMarkdownImageUrl(imageName) {
    const imageUrl = path.join(this.relativeImageUrl, imageName).replace(/\\/g, '/').replace('public/', '');
    return `![generated image](/${imageUrl})`;
  }

  getServerURL() {
    const url = process.env.SD_WEBUI_URL || '';
    if (!url) {
      throw new Error('Missing SD_WEBUI_URL environment variable.');
    }
    return url;
  }

  getApiKey() {
    const key = process.env.SD_WEBUI_API_KEY || '';
    if (!key) {
      throw new Error('Missing SD_WEBUI_API_KEY environment variable.');
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

  needPngMetadata() {
    const needPngMetadata = process.env.SD_WEBUI_NEED_PNG_METADATA.toLowerCase() === 'true' || true; // default to true
    console.log('needPNgMetadata', typeof needPngMetadata);
    if (typeof needPngMetadata !== 'boolean') {
      throw new Error('Missing SD_WEBUI_NEED_PNG_METADATA environment variable.');
    }
    return needPngMetadata;
  }

  getTxt2ImgUrl(url) {
    return `${url}/sdapi/v1/txt2img`;
  }

  getTxt2ImgPayHeaders() {
    return this.headers;
  }

  getTxt2ImgPayload(input) {
    return {
      prompt: input[0],
      negative_prompt: input[1],
      steps: 20
    };
  }

  getPngInfoUrl(url) {
    return `${url}/sdapi/v1/png-info`;
  }

  getPngInfoHeaders() {
    return this.headers;
  }

  getPngInfoPayload(image) {
    return { image: `data:image/png;base64,${image}` };
  }

  async _call(data) {
    const url = this.url;

    const response = await axios.post(this.getTxt2ImgUrl(url),
      this.getTxt2ImgPayload(data),
      { headers: this.getTxt2ImgPayHeaders() }
    );
    const image = response.data.images[0];

    // Generate unique name
    const imageName = `${Date.now()}.png`;
    this.outputPath = path.resolve(__dirname, '..', '..', '..', '..', '..', 'client', 'public', 'images');
    const appRoot = path.resolve(__dirname, '..', '..', '..', '..', '..', 'client');
    this.relativeImageUrl = path.relative(appRoot, this.outputPath);

    // Check if directory exists, if not create it
    if (!fs.existsSync(this.outputPath)) {
      fs.mkdirSync(this.outputPath, { recursive: true });
    }

    try {
      const buffer = Buffer.from(image.split(',', 1)[0], 'base64');
      const filepath = this.outputPath + '/' + imageName;
      if (this.needPngMetadata) {
        const response2 = await axios.post(this.getPngInfoUrl(url),
          this.getPngInfoPayload(image),
          { headers: this.getPngInfoHeaders() }
        );
        const info = response2.data.info;

        await sharp(buffer)
          .withMetadata({
            iptcpng: {
              parameters: info
            }
          })
          .toFile(filepath);
      } else {
        await sharp(buffer).toFile(filepath);
      }
      this.result = this.getMarkdownImageUrl(imageName);
    } catch (error) {
      console.error('Error while saving the image:', error);
      // this.result = theImageUrl;
    }

    return this.result;
  }
}

module.exports = StableDiffusionAPI;
