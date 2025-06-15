// Google Veo3 API service through fal.ai for video generation with audio
const { fal } = require('@fal-ai/client');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../config');

// Initialize fal.ai client with API key
console.log('FAL_AI_KEY exists:', !!config.FAL_AI_KEY);
console.log('FAL_AI_KEY length:', config.FAL_AI_KEY ? config.FAL_AI_KEY.length : 0);

fal.config({
  credentials: config.FAL_AI_KEY
});

/**
 * Generate a video with audio using Google's Veo3 model via fal.ai
 * @param {string} prompt - The prompt for the video
 * @param {string|number} duration - The duration of the video in seconds (e.g., "5s" or 5)
 * @returns {Promise<Object>} - The result from the API call
 */
async function generateVideoWithAudio(prompt, duration) {
  try {
    console.log('Starting Veo3 video generation...');
    
    // IMPORTANT: We've discovered that the Veo3 API only accepts "8s" as a valid duration
    // Any other duration value results in a 422 Unprocessable Entity error
    // So we'll ignore any passed duration and always use "8s"
    const formattedDuration = '8s';
    
    // Log what we're doing
    if (duration && duration !== '8s' && duration !== 8) {
      console.log(`Note: Ignoring provided duration (${duration}) and using 8s instead, as Veo3 API only accepts 8s`);
    } else {
      console.log('Using duration: 8s');
    }
    
    console.log(`Using prompt (first 100 chars): ${prompt.substring(0, 100)}...`);
    console.log(`Using duration: ${formattedDuration}`);
    
    // Call the Veo3 API with exact parameters from documentation
    console.log('Calling fal.ai Veo3 API...');
    
    // Use the EXACT same format as the working test script
    const result = await fal.subscribe("fal-ai/veo3", {
      input: {
        prompt: prompt,
        aspect_ratio: "9:16",
        duration: formattedDuration,
        enhance_prompt: true,
        generate_audio: true
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          update.logs.map((log) => log.message).forEach(console.log);
        }
      },
    });
    
    console.log('Veo3 API call successful!');
    
    // Extract video URL based on documentation output schema
    let videoUrl;
    if (result.data && result.data.video && result.data.video.url) {
      videoUrl = result.data.video.url;
    } else if (result.data && result.data.url) {
      videoUrl = result.data.url;
    } else {
      throw new Error('No video URL found in response');
    }
    
    console.log('Video URL:', videoUrl);
    
    return {
      videoUrl,
      requestId: result.requestId,
      data: result.data
    };
  } catch (error) {
    console.error(`Error generating video with Veo3: ${error.message}`);
    throw error;
  }
}

/**
 * Download video from URL to local file
 * @param {string} videoUrl - URL of the video to download
 * @param {string} outputPath - Path to save the downloaded video
 * @returns {Promise<string>} - Path to the downloaded video file
 */
async function downloadVideo(videoUrl, outputPath) {
  try {
    console.log(`Downloading video from ${videoUrl} to ${outputPath}...`);
    
    // Download the video from the URL
    const response = await axios({
      url: videoUrl,
      method: 'GET',
      responseType: 'stream'
    });
    
    // Save the video to a file
    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        console.log(`Video downloaded successfully to ${outputPath}`);
        resolve(outputPath);
      });
      writer.on('error', (err) => {
        console.error(`Error downloading video:`, err);
        reject(err);
      });
    });
  } catch (error) {
    console.error('Error downloading video:', error);
    throw error;
  }
}

module.exports = {
  generateVideoWithAudio,
  downloadVideo
};
