// Movie generation service
const path = require('path');
const fs = require('fs');
const falService = require('./fal');
const livepeerService = require('./livepeer');
const mediaUtils = require('../utils/media');

/**
 * Generate audio for all scenes in a movie
 * @param {object} sceneData - Scene data with dialogue and sound effects
 * @returns {Promise<Array>} - Array of audio results
 */
async function generateSceneAudio(sceneData) {
  try {
    console.log('Generating scene audio...');
    
    const audioResults = [];
    
    for (let i = 0; i < sceneData.scenes.length; i++) {
      const scene = sceneData.scenes[i];
      console.log(`Generating audio for scene ${i + 1}...`);
      
      // Generate dialogue audio if present
      let dialoguePath = null;
      if (scene.dialogue && scene.dialogue.text && scene.dialogue.text.trim() !== '') {
        const timestamp = Date.now();
        dialoguePath = `dialogue_${i}_${timestamp}.mp3`;
        await livepeerService.generateDialogue({
          text: scene.dialogue.text,
          description: scene.dialogue.description || 'Narrator',
          outputPath: dialoguePath
        });
        // Verify the file exists
        if (fs.existsSync(dialoguePath)) {
          console.log(`Dialogue audio for scene ${i + 1} generated successfully at ${dialoguePath}`);
        } else {
          // Check if the file was created with a different extension
          const wavPath = `dialogue_${timestamp}.wav`;
          if (fs.existsSync(wavPath)) {
            dialoguePath = wavPath;
            console.log(`Found dialogue audio at ${dialoguePath} instead`);
          } else {
            console.warn(`Dialogue audio file not found at expected path: ${dialoguePath}`);
            dialoguePath = null;
          }
        }
      }
      
      // Generate sound effect audio if present
      let soundEffectPath = null;
      if (scene.soundEffect && scene.soundEffect.trim() !== '') {
        soundEffectPath = path.resolve(process.cwd(), `sound_effect_${i}_${Date.now()}.mp3`);
        await livepeerService.generateSoundEffect(scene.soundEffect, soundEffectPath);
        console.log(`Sound effect audio for scene ${i + 1} generated successfully`);
      }
      
      // Combine dialogue and sound effect if both exist
      let combinedAudioPath = null;
      if (dialoguePath && soundEffectPath) {
        combinedAudioPath = path.resolve(process.cwd(), `combined_audio_${i}_${Date.now()}.mp3`);
        await mediaUtils.combineAudioFiles(dialoguePath, soundEffectPath, combinedAudioPath);
        console.log(`Combined audio for scene ${i + 1} created successfully`);
      } else if (dialoguePath) {
        combinedAudioPath = dialoguePath;
      } else if (soundEffectPath) {
        combinedAudioPath = soundEffectPath;
      }
      
      // We'll keep the original audio and extend the video duration later when combining
      
      audioResults.push({
        dialoguePath,
        soundEffectPath,
        combinedAudioPath
      });
    }
    
    return audioResults;
  } catch (error) {
    console.error('Error generating scene audio:', error);
    throw error;
  }
}

/**
 * Generate content for a single scene
 * @param {Object} scene - Scene data
 * @param {number} index - Scene index
 * @param {number} totalScenes - Total number of scenes
 * @returns {Promise<Object>} - Generated scene content
 */
async function generateSceneContent(scene, index, totalScenes) {
  try {
    console.log(`Processing scene ${index + 1}/${totalScenes}...`);
    console.log(`Generating video for prompt: ${scene.prompt}`);
    
    // Generate video using fal.ai
    const videoPath = path.resolve(process.cwd(), `ai_generated_video_${index}_${Date.now()}.mp4`);
    const videoData = await falService.generateVideoFromText(scene.prompt, scene.duration);
    await mediaUtils.saveVideoToFile(videoData, videoPath);
    
    // Verify the video file exists
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file was not created at ${videoPath}`);
    }
    
    // Get video duration
    const videoDuration = await mediaUtils.getMediaDuration(videoPath);
    console.log(`Video ${index} duration: ${videoDuration}s`);
    
    return {
      videoPath: videoPath,
      videoDuration: videoDuration,
      scene: scene
    };
  } catch (error) {
    console.error(`Error generating scene content for scene ${index}:`, error);
    throw error;
  }
}

/**
 * Generate a movie scene from scene data
 * @param {object} sceneData - Scene data with prompts, dialogue, and sound effects
 * @returns {Promise<string>} - Playback URL for the generated movie
 */
async function generateMovieScene(sceneData) {
  try {
    console.log('Starting parallel processing of scenes...');

    // Start video and audio generation in parallel
    console.log('Starting video and audio generation in parallel...');
    
    // Generate audio for all scenes
    const audioPromise = generateSceneAudio(sceneData);
    
    // Process all video scenes
    const videoPromises = [];
    for (let i = 0; i < sceneData.scenes.length; i++) {
      videoPromises.push(generateSceneContent(sceneData.scenes[i], i, sceneData.scenes.length));
    }
    
    // Wait for all videos to be generated
    const videoResults = await Promise.all(videoPromises);
    console.log('All videos generated successfully');
    
    // Wait for audio generation to complete
    const audioResults = await audioPromise;
    console.log('All audio generated successfully');
    
    // Extend videos to match audio durations if needed
    const finalVideoResults = [];
    for (let i = 0; i < videoResults.length; i++) {
      const videoResult = videoResults[i];
      const audioResult = audioResults[i];
      
      if (!audioResult.combinedAudioPath) {
        console.log(`No audio for scene ${i}, using original video`);
        finalVideoResults.push(videoResult.videoPath);
        continue;
      }
      
      // Get audio duration
      const audioDuration = await mediaUtils.getMediaDuration(audioResult.combinedAudioPath);
      console.log(`Audio ${i} duration: ${audioDuration}s`);
      
      // If audio is longer than video, extend the video
      if (audioDuration > videoResult.videoDuration) {
        console.log(`Audio is longer than video for scene ${i}. Extending video...`);
        const extendedVideoPath = await mediaUtils.extendVideoDuration(videoResult.videoPath, audioDuration);
        finalVideoResults.push(extendedVideoPath);
      } else {
        finalVideoResults.push(videoResult.videoPath);
      }
    }
    
    console.log('Creating final video with audio...');
    const finalVideoPath = `final_movie_${Date.now()}.mp4`;
    await mediaUtils.createVideoWithAudio(
      finalVideoResults,
      audioResults.map(result => result.combinedAudioPath),
      finalVideoPath
    );

    console.log('Uploading video to Livepeer...');
    const playbackUrl = await livepeerService.uploadVideoToLivepeer(finalVideoPath);
    console.log('Movie scene generated and uploaded successfully!');
    console.log('You can view your video at:', playbackUrl);

    // Clean up temporary files
    try {
      // Clean up video files
      for (const videoPath of finalVideoResults) {
        if (videoPath && fs.existsSync(videoPath)) {
          await fs.promises.unlink(videoPath);
        }
      }
      
      // Clean up original video files if they're different from final ones
      for (const result of videoResults) {
        if (result.videoPath && 
            !finalVideoResults.includes(result.videoPath) && 
            fs.existsSync(result.videoPath)) {
          await fs.promises.unlink(result.videoPath);
        }
      }
      
      // Clean up audio files
      for (const result of audioResults) {
        if (result.dialoguePath && fs.existsSync(result.dialoguePath)) {
          await fs.promises.unlink(result.dialoguePath);
        }
        if (result.soundEffectPath && fs.existsSync(result.soundEffectPath)) {
          await fs.promises.unlink(result.soundEffectPath);
        }
        if (result.combinedAudioPath && 
            result.combinedAudioPath !== result.dialoguePath && 
            result.combinedAudioPath !== result.soundEffectPath && 
            fs.existsSync(result.combinedAudioPath)) {
          await fs.promises.unlink(result.combinedAudioPath);
        }
      }
      
      // Don't delete the final video as it's needed for the playback URL
      // await fs.promises.unlink(finalVideoPath);
    } catch (error) {
      console.error('Error cleaning up temporary files:', error);
    }

    return playbackUrl;
  } catch (error) {
    console.error('Error generating movie:', error);
    throw error;
  }
}

module.exports = {
  generateMovieScene,
  generateSceneAudio
};
