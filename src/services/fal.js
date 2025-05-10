// Fal.ai API service for text-to-video generation
const { fal } = require('@fal-ai/client');
const config = require('../config');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

// Initialize fal.ai client with API key
fal.config({
  credentials: config.FAL_AI_KEY
});

/**
 * Generate video from text prompt
 * @param {string} prompt - Text prompt for video generation
 * @param {number} duration - Target duration in seconds
 * @param {number} retryCount - Current retry count
 * @returns {Promise<object>} - Video generation result
 */
async function generateVideoFromText(prompt, duration, retryCount = 0) {
  try {
    console.log('Calling fal.ai text-to-video API...');
    
    // Calculate num_frames based on duration (assuming 24fps)
    const fps = config.DEFAULT_FPS;
    const numFrames = Math.min(Math.ceil(duration * fps), config.MAX_FRAMES); // fal.ai max is 48 frames
    
    // Add strong portrait orientation hints to the prompt
    const enhancedPrompt = `${prompt} (vertical format, portrait orientation, 9:16 aspect ratio, vertical video, mobile phone format)`;
    console.log(`Using portrait-enhanced prompt: ${enhancedPrompt}`);
    
    // Generate portrait video with dimensions 576x1024 (9:16 aspect ratio)
    console.log('Generating portrait video with dimensions 576x1024 (9:16 aspect ratio)');
    
    // Use the model that we know works, but with stronger portrait dimensions
    const result = await fal.run('fal-ai/fast-svd/text-to-video', {
      input: {
        prompt: enhancedPrompt,
        negative_prompt: 'poor quality, distortion, low resolution, blurry, text, watermark, landscape orientation, wide format, horizontal video, 16:9 aspect ratio',
        num_frames: numFrames,
        width: 576,     // Width smaller than height for portrait
        height: 1024,   // Height larger than width for portrait (9:16 ratio)
        guidance_scale: 9.0,  // Increased guidance scale for better adherence to prompt
        num_inference_steps: 30, // More steps for better quality
        fps: fps
      }
    });
    
    console.log('Video generation parameters:', {
      prompt: enhancedPrompt,
      dimensions: '576x1024', // 9:16 Portrait dimensions
      fps: fps,
      duration: duration,
      frames: numFrames
    });
    
    console.log('Video generated successfully from fal.ai');
    
    // Extract the video URL from the response
    if (result && result.data && result.data.video && result.data.video.url) {
      return result; // Return the full result object
    } else {
      console.error('Unexpected response structure from fal.ai:', JSON.stringify(result, null, 2));
      throw new Error('Could not extract video URL from fal.ai response');
    }
  } catch (error) {
    console.error(`Error generating video from text (attempt ${retryCount + 1}):`, error.message);
    
    if (retryCount < config.MAX_RETRIES) {
      console.log(`Retrying in ${config.RETRY_DELAY / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, config.RETRY_DELAY));
      return generateVideoFromText(prompt, duration, retryCount + 1);
    }
    
    throw error;
  }
}

module.exports = {
  generateVideoFromText
};
