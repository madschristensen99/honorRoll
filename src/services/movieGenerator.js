// Movie generation service
const path = require('path');
const fs = require('fs');
const axios = require('axios');
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
        // Use a unique timestamp for each scene to ensure different files
        const timestamp = Date.now() + i; // Add index to ensure uniqueness
        dialoguePath = `dialogue_${i}_${timestamp}.mp3`;
        
        // Log the text for debugging
        console.log(`Scene ${i + 1} dialogue text: "${scene.dialogue.text}"`);
        
        // Generate the dialogue audio
        await livepeerService.generateDialogue({
          text: scene.dialogue.text,
          description: scene.dialogue.description || 'Narrator',
          outputPath: dialoguePath
        });
        
        // Verify the file exists and check its duration
        if (fs.existsSync(dialoguePath)) {
          // Get the actual duration of the generated dialogue
          const dialogueDuration = await mediaUtils.getMediaDuration(dialoguePath);
          console.log(`Scene ${i + 1} dialogue duration: ${dialogueDuration}s`);
          
          // Store the duration in the scene for later use
          scene.actualDialogueDuration = dialogueDuration;
          
          console.log(`Dialogue audio for scene ${i + 1} generated successfully at ${dialoguePath}`);
        } else {
          // Check if the file was created with a different extension
          const wavPath = `dialogue_${timestamp}.wav`;
          if (fs.existsSync(wavPath)) {
            dialoguePath = wavPath;
            const dialogueDuration = await mediaUtils.getMediaDuration(dialoguePath);
            scene.actualDialogueDuration = dialogueDuration;
            console.log(`Found dialogue audio at ${dialoguePath} instead, duration: ${dialogueDuration}s`);
          } else {
            console.warn(`Dialogue audio file not found at expected path: ${dialoguePath}`);
            dialoguePath = null;
          }
        }
      }
      
      // Generate sound effect audio if present
      let soundEffectPath = null;
      if (scene.soundEffect && scene.soundEffect.trim() !== '') {
        // Use a unique timestamp for each scene to ensure different files
        const timestamp = Date.now() + i + 1000; // Add offset to ensure uniqueness from dialogue
        soundEffectPath = path.resolve(process.cwd(), `sound_effect_${i}_${timestamp}.mp3`);
        
        await livepeerService.generateSoundEffect(scene.soundEffect, soundEffectPath);
        console.log(`Sound effect audio for scene ${i + 1} generated successfully`);
        
        // Check sound effect duration - ElevenLabs typically returns 4-second clips
        const soundEffectDuration = await mediaUtils.getMediaDuration(soundEffectPath);
        console.log(`Original sound effect duration for scene ${i + 1}: ${soundEffectDuration}s`);
        
        // If dialogue exists, trim the sound effect to EXACTLY match dialogue duration
        if (dialoguePath && scene.actualDialogueDuration) {
          // Use the stored dialogue duration to ensure consistency
          const dialogueDuration = scene.actualDialogueDuration;
          
          // Trim sound effect to match dialogue duration EXACTLY
          console.log(`Trimming sound effect from ${soundEffectDuration}s to EXACTLY match dialogue (${dialogueDuration}s)`);
          const trimmedSoundEffectPath = path.resolve(process.cwd(), `trimmed_sound_effect_${i}_${timestamp}.mp3`);
          
          // Check if the sound effect needs trimming
          if (soundEffectDuration > dialogueDuration) {
            // Use the updated trimAudio function with explicit output path
            const trimmedPath = await mediaUtils.trimAudio(soundEffectPath, dialogueDuration, trimmedSoundEffectPath);
            // Replace the original sound effect with the trimmed version
            soundEffectPath = trimmedPath;
          } else {
            console.log(`Sound effect duration (${soundEffectDuration}s) is already shorter than dialogue (${dialogueDuration}s)`);
          }
          
          // Verify the trimmed sound effect duration
          const trimmedDuration = await mediaUtils.getMediaDuration(soundEffectPath);
          console.log(`Trimmed sound effect duration: ${trimmedDuration}s (target was ${dialogueDuration}s)`);
        }
      }
      
      // Combine dialogue and sound effect if both exist
      let combinedAudioPath = null;
      if (dialoguePath && soundEffectPath) {
        const timestamp = Date.now() + i + 2000; // Add offset to ensure uniqueness
        combinedAudioPath = path.resolve(process.cwd(), `combined_audio_${i}_${timestamp}.mp3`);
        
        await mediaUtils.combineAudioFiles(dialoguePath, soundEffectPath, combinedAudioPath);
        console.log(`Combined audio for scene ${i + 1} generated successfully`);
        
        // Check combined audio duration
        const combinedDuration = await mediaUtils.getMediaDuration(combinedAudioPath);
        console.log(`Combined audio duration for scene ${i + 1}: ${combinedDuration}s`);
      } else if (dialoguePath) {
        combinedAudioPath = dialoguePath;
      } else if (soundEffectPath) {
        combinedAudioPath = soundEffectPath;
      }
      
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
 * @param {number} [dialogueDuration=null] - Optional dialogue duration to match
 * @returns {Promise<Object>} - Generated scene content
 */
async function generateSceneContent(scene, index, totalScenes, dialogueDuration = null) {
  try {
    console.log(`Generating scene ${index + 1} of ${totalScenes}...`);
    
    // Generate video for the scene with the exact dialogue duration if available
    // This ensures videos match dialogue length precisely
    const videoResult = await falService.generateVideoFromText(scene.prompt, dialogueDuration || index);
    console.log(`Video for scene ${index + 1} generated successfully`);
    
    // Save the video data to a local file
    const videoFileName = `ai_generated_video_${index}_${Date.now()}.mp4`;
    const videoFilePath = path.resolve(process.cwd(), videoFileName);
    
    // Check if videoResult.videoData is a URL or an object
    let videoUrl;
    if (typeof videoResult.videoData === 'string') {
      videoUrl = videoResult.videoData;
    } else if (videoResult.videoData && videoResult.videoData.url) {
      videoUrl = videoResult.videoData.url;
    } else {
      console.error(`Invalid video data format for scene ${index + 1}:`, videoResult);
      throw new Error(`Invalid video data format for scene ${index + 1}`);
    }
    
    // Download the video from the URL
    const response = await axios({
      url: videoUrl,
      method: 'GET',
      responseType: 'stream'
    });
    
    // Save the video to a file
    const writer = fs.createWriteStream(videoFilePath);
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        console.log(`Video for scene ${index + 1} saved to ${videoFilePath}`);
        resolve({
          videoPath: videoFilePath,
          index
        });
      });
      writer.on('error', (err) => {
        console.error(`Error saving video for scene ${index + 1}:`, err);
        reject(err);
      });
    });
  } catch (error) {
    console.error(`Error generating scene ${index + 1}:`, error);
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
    console.log('Starting movie generation...');
    
    // Generate audio for all scenes first to get dialogue durations
    const audioResults = await generateSceneAudio(sceneData);
    console.log('All audio generated successfully');
    
    // Process all video scenes with the exact dialogue durations
    const videoPromises = [];
    for (let i = 0; i < sceneData.scenes.length; i++) {
      // Get the dialogue duration for this scene if available
      let dialogueDuration = null;
      if (audioResults[i] && audioResults[i].dialoguePath) {
        try {
          // Get the actual dialogue duration
          dialogueDuration = await mediaUtils.getMediaDuration(audioResults[i].dialoguePath);
          
          // Cap at MAX_CLIP_DURATION if needed
          const MAX_CLIP_DURATION = 4.0;
          if (dialogueDuration > MAX_CLIP_DURATION) {
            console.log(`Dialogue duration (${dialogueDuration}s) exceeds max (${MAX_CLIP_DURATION}s) for scene ${i}. Capping video duration.`);
            dialogueDuration = MAX_CLIP_DURATION;
          } else {
            console.log(`Using exact dialogue duration (${dialogueDuration}s) for video generation of scene ${i}`);
          }
        } catch (error) {
          console.error(`Error getting dialogue duration for scene ${i}:`, error.message);
        }
      }
      
      // Generate video with the exact dialogue duration if available
      videoPromises.push(generateSceneContent(sceneData.scenes[i], i, sceneData.scenes.length, dialogueDuration));
    }
    
    // Wait for all videos to be generated
    const videoResults = await Promise.all(videoPromises);
    console.log('All videos generated successfully');
    
    // Process videos and audio to match durations
    const finalVideoResults = [];
    const finalAudioResults = [];
    const { MAX_VIDEO_DURATION } = require('../config'); // Use the config value
    
    for (let i = 0; i < videoResults.length; i++) {
      const videoResult = videoResults[i];
      const audioResult = audioResults[i];
      
      if (!audioResult.combinedAudioPath) {
        console.log(`No audio for scene ${i}, using original video`);
        finalVideoResults.push(videoResult.videoPath);
        finalAudioResults.push(null);
        continue;
      }
      
      // Process dialogue and sound effects separately according to new requirements
      let finalAudioToUse = null;
      let targetVideoDuration = null;
      
      // Strict maximum duration for any clip
      const MAX_CLIP_DURATION = 4.0;
      
      // Check if we have dialogue audio
      if (audioResult.dialoguePath) {
        // Get dialogue duration
        const dialogueDuration = await mediaUtils.getMediaDuration(audioResult.dialoguePath);
        console.log(`Dialogue audio for scene ${i} duration: ${dialogueDuration}s`);
        
        // If dialogue is longer than 4 seconds, speed it up
        if (dialogueDuration > MAX_CLIP_DURATION) {
          console.log(`Dialogue is longer than ${MAX_CLIP_DURATION}s for scene ${i}. Speeding up dialogue...`);
          const speedUpDialoguePath = await mediaUtils.speedUpAudio(audioResult.dialoguePath, MAX_CLIP_DURATION);
          const newDialogueDuration = await mediaUtils.getMediaDuration(speedUpDialoguePath);
          console.log(`New dialogue duration after speed up: ${newDialogueDuration}s`);
          
          // Use the sped up dialogue duration as target for video
          targetVideoDuration = newDialogueDuration;
          
          // If we also have sound effects, combine them with the sped up dialogue
          if (audioResult.soundEffectPath) {
            console.log(`Combining sped up dialogue with sound effect for scene ${i}...`);
            const combinedPath = path.resolve(process.cwd(), `combined_audio_${i}_${Date.now()}.mp3`);
            await mediaUtils.combineAudioFiles(speedUpDialoguePath, audioResult.soundEffectPath, combinedPath, MAX_CLIP_DURATION);
            finalAudioToUse = combinedPath;
          } else {
            finalAudioToUse = speedUpDialoguePath;
          }
        } else {
          // If dialogue is shorter than 4 seconds, use it as is and adjust video to match exactly
          console.log(`Dialogue duration (${dialogueDuration}s) is within limit for scene ${i}`);
          targetVideoDuration = dialogueDuration;
          
          // If we also have sound effects, combine them with the dialogue
          if (audioResult.soundEffectPath) {
            console.log(`Combining dialogue with sound effect for scene ${i}...`);
            const combinedPath = path.resolve(process.cwd(), `combined_audio_${i}_${Date.now()}.mp3`);
            await mediaUtils.combineAudioFiles(audioResult.dialoguePath, audioResult.soundEffectPath, combinedPath, MAX_CLIP_DURATION);
            finalAudioToUse = combinedPath;
          } else {
            finalAudioToUse = audioResult.dialoguePath;
          }
        }
      } else if (audioResult && audioResult.soundEffectPath) {
        // If we only have sound effects, use them as is but cap at MAX_CLIP_DURATION
        console.log(`Using only sound effect for scene ${i}`);
        
        // Get sound effect duration
        const soundEffectDuration = await mediaUtils.getMediaDuration(audioResult.soundEffectPath);
        console.log(`Sound effect duration: ${soundEffectDuration}s`);
        
        // If sound effect is longer than max duration, speed it up
        if (soundEffectDuration > MAX_CLIP_DURATION) {
          console.log(`Sound effect is longer than ${MAX_CLIP_DURATION}s for scene ${i}. Speeding up sound effect...`);
          const speedUpSoundEffectPath = await mediaUtils.speedUpAudio(audioResult.soundEffectPath, MAX_CLIP_DURATION);
          finalAudioToUse = speedUpSoundEffectPath;
          targetVideoDuration = MAX_CLIP_DURATION;
        } else {
          finalAudioToUse = audioResult.soundEffectPath;
          targetVideoDuration = soundEffectDuration;
        }
      }
      
      // Now adjust the video to match the dialogue duration EXACTLY
      if (finalAudioToUse) {
        // Strict 4-second maximum for each clip
        const MAX_DURATION = 4.0;
        
        // Ensure finalAudioToUse is a string path
        if (typeof finalAudioToUse !== 'string') {
          console.error(`Invalid audio path for scene ${i}: ${finalAudioToUse} (type: ${typeof finalAudioToUse})`);
          console.log('Using original audio file instead');
          finalAudioToUse = audioResult.dialoguePath || audioResult.soundEffectPath || null;
          
          if (!finalAudioToUse) {
            console.log(`No valid audio for scene ${i}, using original video`);
            finalVideoResults.push(videoResult.videoPath);
            finalAudioResults.push(null);
            continue;
          }
        }
        
        // Get the final audio duration - this is what we'll match exactly
        const finalAudioDuration = await mediaUtils.getMediaDuration(finalAudioToUse);
        console.log(`Final audio duration for scene ${i}: ${finalAudioDuration}s`);
        
        // Ensure videoResult.videoPath is a string
        if (typeof videoResult.videoPath !== 'string') {
          console.error(`Invalid video path for scene ${i}: ${videoResult.videoPath} (type: ${typeof videoResult.videoPath})`);
          console.log(`No valid video for scene ${i}, skipping this scene`);
          continue;
        }
        
        // Store the original video duration for comparison
        let originalVideoDuration;
        try {
          originalVideoDuration = await mediaUtils.getMediaDuration(videoResult.videoPath);
          console.log(`Original video duration for scene ${i}: ${originalVideoDuration}s`);
        } catch (error) {
          console.error(`Error getting original video duration for scene ${i}:`, error.message);
          console.log(`No valid video duration for scene ${i}, skipping this scene`);
          continue;
        }
        
        // If audio is longer than 4 seconds, speed it up to fit within 4 seconds
        if (finalAudioDuration > MAX_DURATION) {
          console.log(`Audio is longer than ${MAX_DURATION}s, speeding it up...`);
          const speedUpAudioPath = await mediaUtils.speedUpAudio(finalAudioToUse, MAX_DURATION);
          finalAudioToUse = speedUpAudioPath;
          
          // Get the new audio duration after speeding up
          const newAudioDuration = await mediaUtils.getMediaDuration(finalAudioToUse);
          console.log(`New audio duration after speed up: ${newAudioDuration}s`);
          
          // Adjust video to match the new audio duration EXACTLY
          console.log(`Adjusting video for scene ${i} to EXACTLY ${newAudioDuration}s...`);
          
          // Force exact duration using -t parameter in ffmpeg
          const adjustedVideoPath = await mediaUtils.adjustVideoDuration(videoResult.videoPath, newAudioDuration, null, true);
          
          // Verify the adjusted video duration
          const adjustedVideoDuration = await mediaUtils.getMediaDuration(adjustedVideoPath);
          console.log(`Verified adjusted video duration: ${adjustedVideoDuration}s (target was ${newAudioDuration}s)`);
          
          finalVideoResults.push(adjustedVideoPath);
          finalAudioResults.push(finalAudioToUse);
        } else {
          // If audio is shorter than or equal to 4 seconds, adjust video to match audio EXACTLY
          // This ensures that shorter dialogues get shorter videos
          console.log(`Adjusting video to EXACTLY match audio duration (${finalAudioDuration}s) for scene ${i}...`);
          
          // Force exact duration using -t parameter in ffmpeg
          const adjustedVideoPath = await mediaUtils.adjustVideoDuration(videoResult.videoPath, finalAudioDuration, null, true);
          
          // Verify the adjusted video duration
          const adjustedVideoDuration = await mediaUtils.getMediaDuration(adjustedVideoPath);
          console.log(`Verified adjusted video duration: ${adjustedVideoDuration}s (target was ${finalAudioDuration}s)`);
          
          finalVideoResults.push(adjustedVideoPath);
          finalAudioResults.push(finalAudioToUse);
        }
        
        // Final check to ensure video and audio durations match
        const finalVideoPath = finalVideoResults[finalVideoResults.length - 1];
        
        // Ensure paths are strings before checking durations
        if (typeof finalVideoPath === 'string' && typeof finalAudioToUse === 'string') {
          try {
            const finalVideoPathDuration = await mediaUtils.getMediaDuration(finalVideoPath);
            const finalAudioPathDuration = await mediaUtils.getMediaDuration(finalAudioToUse);
            console.log(`FINAL CHECK - Scene ${i}: Video duration: ${finalVideoPathDuration}s, Audio duration: ${finalAudioPathDuration}s`);
          } catch (error) {
            console.error(`Error checking final durations for scene ${i}:`, error.message);
          }
        } else {
          console.error(`Invalid paths for final check - Scene ${i}:`, 
            `Video path (${typeof finalVideoPath}): ${finalVideoPath}`, 
            `Audio path (${typeof finalAudioToUse}): ${finalAudioToUse}`);
        }
      } else {
        // Fallback if something went wrong
        console.log(`No audio processing needed for scene ${i}, using original files`);
        finalVideoResults.push(videoResult.videoPath);
        finalAudioResults.push(null);
      }
    }
    
    console.log('Creating final video with audio...');
    const finalVideoPath = `final_movie_${Date.now()}.mp4`;
    await mediaUtils.createVideoWithAudio(
      finalVideoResults,
      finalAudioResults,
      finalVideoPath
    );

    console.log('Uploading video to Livepeer...');
    const playbackUrl = await livepeerService.uploadVideoToLivepeer(finalVideoPath);
    console.log('Movie scene generated and uploaded successfully!');
    console.log('You can view your video at:', playbackUrl);

    // Clean up temporary files
    try {
      console.log('Cleaning up temporary files...');
      
      // Get all files in the current directory
      const currentDir = process.cwd();
      const allFiles = fs.readdirSync(currentDir);
      
      // Define patterns for temporary files
      const tempFilePatterns = [
        /^ai_generated_video_\d+_\d+\.mp4$/,       // Original generated videos
        /^adjusted_video_\d+\.mp4$/,               // Adjusted videos
        /^extended_video_\d+\.mp4$/,               // Extended videos
        /^dialogue_\d+_\d+\.mp3$/,                 // Dialogue audio
        /^sound_effect_\d+_\d+\.mp3$/,             // Sound effect audio
        /^combined_audio_\d+_\d+\.mp3$/,           // Combined audio
        /^sped_up_audio_\d+\.mp3$/,                // Sped up audio
        /^trimmed_audio_\d+\.mp3$/,                // Trimmed audio
        /^temp_dialogue_\d+\.wav$/,                // Temporary dialogue WAV
        /^temp_sfx_\d+\.wav$/,                     // Temporary sound effect WAV
        /^temp_video_audio_\d+\.mp4$/              // Temporary video with audio
      ];
      
      // Keep track of files to preserve
      const preserveFiles = [finalVideoPath];
      
      // Delete all temporary files except the final video
      for (const file of allFiles) {
        // Skip if it's a directory or a file we want to preserve
        if (fs.statSync(path.join(currentDir, file)).isDirectory() || preserveFiles.includes(file)) {
          continue;
        }
        
        // Check if the file matches any of our temporary file patterns
        const isTemp = tempFilePatterns.some(pattern => pattern.test(file));
        if (isTemp) {
          try {
            await fs.promises.unlink(path.join(currentDir, file));
            console.log(`Deleted temporary file: ${file}`);
          } catch (deleteError) {
            console.error(`Error deleting ${file}:`, deleteError);
          }
        }
      }
      
      // Additionally, clean up the specific files we know about
      // Clean up video files
      for (const videoPath of finalVideoResults) {
        if (videoPath && fs.existsSync(videoPath) && !preserveFiles.includes(path.basename(videoPath))) {
          await fs.promises.unlink(videoPath);
        }
      }
      
      // Clean up original video files if they're different from final ones
      for (const result of videoResults) {
        if (result.videoPath && 
            !finalVideoResults.includes(result.videoPath) && 
            fs.existsSync(result.videoPath) &&
            !preserveFiles.includes(path.basename(result.videoPath))) {
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
      
      // Clean up final audio results
      for (const audioPath of finalAudioResults) {
        if (audioPath && fs.existsSync(audioPath)) {
          await fs.promises.unlink(audioPath);
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
