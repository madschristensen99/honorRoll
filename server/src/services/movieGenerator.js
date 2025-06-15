// Movie generation service using Google's Veo3 model through fal.ai
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);
const veo3Service = require('./veo3');
const livepeerService = require('./livepeer');
const config = require('../config');

/**
 * Handle movie creation from multiple scenes
 * @param {Array} scenes - Array of scenes from Grok API
 * @returns {Promise<string>} - Playback URL for the generated movie
 */
async function handleCreateMovieFromScenes(scenes) {
  try {
    console.log(`Starting movie generation with ${scenes.length} scenes...`);
    
    // Create output and temporary directories with timestamps for uniqueness
    const timestamp = Date.now();
    const outputDir = path.resolve(process.cwd(), 'output');
    const tempDir = path.resolve(outputDir, `temp_${timestamp}`);
    const finalOutputFilename = `video_${timestamp}.mp4`;
    const finalOutputPath = path.resolve(outputDir, finalOutputFilename);
    
    // Ensure output directories exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    console.log(`Created temporary directory: ${tempDir}`);
    
    // Generate videos for all scenes in parallel
    console.log('Generating videos for all scenes in parallel...');
    const scenePromises = scenes.map(async (scene, index) => {
      const scenePrompt = scene.prompt;
      // Ensure duration is in the correct format (8s is the only reliable value for Veo3)
      const sceneDuration = '8s';
      
      console.log(`\nProcessing scene ${index + 1}/${scenes.length}:`);
      console.log(`Scene prompt: "${scenePrompt.substring(0, 100)}..."`);
      console.log(`Scene duration: ${sceneDuration}`);
      
      try {
        // Generate video with Veo3
        console.log(`Generating video for scene ${index + 1}...`);
        const videoResult = await veo3Service.generateVideoWithAudio(scenePrompt, sceneDuration);
        
        // Download the video
        const sceneOutputPath = path.join(tempDir, `scene_${index + 1}.mp4`);
        await veo3Service.downloadVideo(videoResult.videoUrl, sceneOutputPath);
        console.log(`Scene ${index + 1} video downloaded to ${sceneOutputPath}`);
        
        return {
          index,
          path: sceneOutputPath,
          success: true
        };
      } catch (error) {
        console.error(`Error generating video for scene ${index + 1}: ${error.message}`);
        return {
          index,
          success: false,
          error: error.message
        };
      }
    });
    
    // Wait for all scene videos to be generated
    const sceneResults = await Promise.all(scenePromises);
    
    // Filter successful scene generations
    const successfulScenes = sceneResults.filter(result => result.success);
    
    if (successfulScenes.length === 0) {
      throw new Error('No scenes were successfully generated');
    }
    
    console.log(`\nSuccessfully generated ${successfulScenes.length}/${scenes.length} scene videos`);
    
    // If only one scene was successful, use it directly
    if (successfulScenes.length === 1) {
      console.log('Only one scene was successful, using it directly');
      fs.copyFileSync(successfulScenes[0].path, finalOutputPath);
    } else {
      // Create a file list for ffmpeg
      const fileListPath = path.join(tempDir, 'filelist.txt');
      const fileListContent = successfulScenes
        .sort((a, b) => a.index - b.index) // Sort by original index
        .map(scene => `file '${scene.path}'`)
        .join('\n');
      
      fs.writeFileSync(fileListPath, fileListContent);
      
      // Join videos with ffmpeg
      console.log('Joining videos with ffmpeg...');
      try {
        await execPromise(`ffmpeg -f concat -safe 0 -i "${fileListPath}" -c copy "${finalOutputPath}"`);
        console.log('Videos joined successfully');
      } catch (error) {
        console.error(`Error joining videos: ${error.message}`);
        // If joining fails, use the first successful scene
        console.log('Falling back to using the first successful scene');
        fs.copyFileSync(successfulScenes[0].path, finalOutputPath);
      }
    }
    
    console.log(`Final video saved to: ${finalOutputPath}`);
    
    // Upload to Livepeer
    console.log('Uploading video to Livepeer...');
    const playbackUrl = await livepeerService.uploadVideoToLivepeer(finalOutputPath);
    console.log('Video uploaded to Livepeer:', playbackUrl);
    
    // Clean up temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
      console.log('Temporary files cleaned up');
    } catch (error) {
      console.error(`Error cleaning up temporary files: ${error.message}`);
    }
    
    return playbackUrl;
  } catch (error) {
    console.error('Error generating movie from scenes:', error);
    throw error;
  }
}

/**
 * Handle movie creation from prompt (legacy method, now calls the multi-scene version)
 * @param {string} prompt - Text prompt for video generation
 * @param {string} duration - Duration from Grok API (e.g., "8s")
 * @returns {Promise<string>} - Playback URL for the generated movie
 */
async function handleCreateMovie(prompt, duration = "8s") {
  try {
    console.log('Starting single-scene movie generation (legacy method)');
    console.log(`Prompt: "${prompt}"`);
    console.log(`Using duration: ${duration}`);
    
    // Create a single scene and process it with the multi-scene handler
    const scenes = [
      {
        prompt: prompt,
        duration: parseInt(duration.replace('s', ''))
      }
    ];
    
    return await handleCreateMovieFromScenes(scenes);
  } catch (error) {
    console.error('Error in legacy movie generation:', error);
    throw error;
  }
}

module.exports = {
  handleCreateMovie,
  handleCreateMovieFromScenes
};
