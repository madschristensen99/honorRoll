# DreamScroll

An AI-powered movie generation tool that creates short-form vertical videos with synchronized audio for mobile platforms.

## Features

- **AI-Generated Videos**: Creates videos in portrait orientation (9:16 aspect ratio) using fal.ai's text-to-video API
- **AI-Generated Audio**: Produces dialogue and sound effects using Livepeer and ElevenLabs APIs
- **Story Generation**: Creates engaging storylines using the Grok API
- **Synchronized Media**: Automatically synchronizes audio and video durations
- **Parallel Processing**: Generates video and audio concurrently for faster creation
- **Modular Architecture**: Well-organized codebase with separate modules for different services

## Technology Decisions

### Video Generation Approach

We evaluated several approaches for AI video generation:

1. **Livepeer Text-to-Image-to-Video**: While more cost-effective, this approach (converting text to images and then to video and adjusting length using ffmpeg) produces blurrier outputs with less coherent motion. We've included this implementation in the `textToimgTovideo` directory for reference.

2. **fal.ai Fast-SVD Model** (Current Implementation): Offers a good balance between quality and cost. This model produces decent quality videos with reasonable generation times and costs.

3. **High-End Models** (e.g., Klingon 2.0 Master): These models produce significantly higher quality videos but at a much higher cost (several dollars per video generated). This option would be suitable for production-quality content but is expensive for experimentation.

Our current implementation uses the fal.ai Fast-SVD model as it provides the best balance of quality and cost for our needs. The code is structured to make it relatively easy to switch to other models if needed.

## Project Structure

```
/src
  /config       - Configuration settings and API keys
  /services     - API service modules (Grok, fal.ai, Livepeer)
  /utils        - Utility functions for media processing
  index.js      - Main application logic
/textToimgTovideo - Alternative implementation using text-to-image-to-video approach
index.js        - Entry point wrapper script
```

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/madschristensen99/dreamScroll.git
   cd dreamScroll
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file with your API keys (see `.env.example` for required keys):
   ```
   ELEVENLABS_API_KEY=your_elevenlabs_key
   LIVEPEER_API_KEY=your_livepeer_key
   GROK_API_KEY=your_grok_key
   FAL_AI_KEY=your_fal_ai_key
   ```

## Usage

Generate a movie with a prompt:

```
node index.js "adventure"
```

The script will:
1. Generate a story with scenes using the Grok API
2. Create portrait-oriented videos for each scene using fal.ai
3. Generate dialogue and sound effects using Livepeer and ElevenLabs
4. Combine everything into a final video with synchronized audio
5. Output a playback URL for the finished movie

### Example

Here's an example of a generated movie with the prompt "A space adventure with aliens":
[https://lvpr.tv/?v=76c6ics4llskc776](https://lvpr.tv/?v=76c6ics4llskc776)

## Dependencies

- `@fal-ai/client`: For text-to-video generation
- `axios`: For API requests
- `dotenv`: For environment variable management
- `form-data`: For handling multipart form data
- `ffmpeg`: For video processing (must be installed on your system)

## License

MIT
