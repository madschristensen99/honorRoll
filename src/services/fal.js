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
    
    // No need to add portrait hints to prompt since we're using video_size parameter
    const enhancedPrompt = prompt;
    console.log(`Using prompt: ${enhancedPrompt}`);
    
    // Calculate frames based on duration to ensure correct video length
    const fps = config.DEFAULT_FPS;
    
    // Generate a video with the appropriate number of frames based on target duration
    // We'll use a consistent fps but vary the number of frames
    const MAX_DURATION = 4.0;
    const STANDARD_FPS = 12;
    
    // Use the exact duration provided for the scene
    // If no duration is provided, default to a value between 2-4 seconds
    // This ensures shorter dialogues get shorter videos
    const targetDuration = typeof duration === 'number' && duration > 0 ? 
                           Math.min(duration, MAX_DURATION) : 
                           Math.min(Math.max(2.0, Math.random() * 4.0), MAX_DURATION);
    
    // Calculate frames based on target duration (rounded to nearest frame)
    const targetFrames = Math.round(targetDuration * STANDARD_FPS);
    
    console.log(`Target duration: ${targetDuration}s, generating ${targetFrames} frames at ${STANDARD_FPS}fps`);
    
    // Increase motion_bucket_id for more motion
    const motionBucketId = 127; // Higher value = more motion
    
    // Increase steps for better quality
    const steps = 25; // More steps = better quality but slower generation
    
    console.log(`Generating ${targetFrames}-frame portrait video at ${STANDARD_FPS}fps`);
    
    // Use the subscribe method with video_size parameter for portrait mode
    // Generate frames based on target duration for more accurate timing
    const result = await fal.subscribe("fal-ai/fast-svd/text-to-video", {
      input: {
        prompt: enhancedPrompt,
        negative_prompt: "unrealistic, saturated, high contrast, big nose, painting, drawing, sketch, cartoon, anime, manga, render, CG, 3d, watermark, signature, label",
        motion_bucket_id: motionBucketId,
        cond_aug: 0.02,
        steps: steps,
        deep_cache: "none",
        fps: STANDARD_FPS,
        num_frames: targetFrames, // Generate frames based on target duration
        video_size: "portrait_16_9" // Use portrait mode
      },
      logs: false, // Disable detailed logs
      // Remove onQueueUpdate to prevent progress logging
    });
    
    // Simplified logging
    console.log(`Generating portrait video (${targetDuration}s target duration) with ${steps} steps...`);
    
    console.log('Video generated successfully from fal.ai');
    
    // Log the full response for debugging
    console.log('Response structure:', Object.keys(result));
    
    // Extract the video URL from the response based on the observed structure
    let videoUrl = null;
    
    // Handle the nested structure we observed in the response
    if (result.data && result.data.video && result.data.video.url) {
      videoUrl = result.data.video.url;
      console.log('Found video URL in result.data.video.url');
    } else if (result.data && result.data.url) {
      videoUrl = result.data.url;
      console.log('Found video URL in result.data.url');
    } else if (result.video) {
      videoUrl = result.video;
      console.log('Found video URL in result.video');
    } else if (result.images && result.images.length > 0) {
      videoUrl = result.images[0];
      console.log('Found video URL in result.images[0]');
    } else {
      console.error('Unexpected response structure:', JSON.stringify(result, null, 2));
      throw new Error('No video data returned from fal.ai');
    }
    
    return {
      videoData: videoUrl,
      targetDuration: targetDuration,  // The target duration for this video
      targetFrames: targetFrames,      // The number of frames generated
      requestId: result.requestId || 'unknown'
    };
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
