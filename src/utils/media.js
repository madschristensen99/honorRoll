// Media utilities for video and audio processing
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const axios = require('axios');

/**
 * Get the duration of a media file (audio or video)
 * @param {string} filePath - Path to the media file
 * @returns {Promise<number>} - Duration in seconds
 */
async function getMediaDuration(filePath) {
  return new Promise((resolve, reject) => {
    exec(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error getting duration for ${filePath}:`, error);
        return reject(error);
      }
      
      const duration = parseFloat(stdout.trim());
      if (isNaN(duration)) {
        console.error(`Could not determine duration for ${filePath}`);
        return reject(new Error(`Could not determine duration for ${filePath}`));
      }
      
      resolve(duration);
    });
  });
}

/**
 * Extend video duration to match audio duration
 * @param {string} videoPath - Path to the video file
 * @param {number} targetDuration - Target duration in seconds
 * @returns {Promise<string>} - Path to the extended video file
 */
async function extendVideoDuration(videoPath, targetDuration) {
  try {
    // Ensure targetDuration is a valid number
    if (typeof targetDuration !== 'number' || isNaN(targetDuration) || targetDuration <= 0) {
      console.error(`Invalid target duration: ${targetDuration}`);
      throw new Error(`Invalid target duration: ${targetDuration}`);
    }

    // Get the actual video duration
    const videoDuration = await getMediaDuration(videoPath);
    console.log(`Video duration: ${videoDuration}s, Target duration: ${targetDuration}s`);
    
    if (videoDuration >= targetDuration) {
      console.log('Video duration is already sufficient, no extension needed');
      return videoPath;
    }
    
    const extensionFactor = targetDuration / videoDuration;
    console.log(`Extending video by factor: ${extensionFactor}`);
    
    // Create a properly formatted output path
    const outputPath = path.join(path.dirname(videoPath), `extended_video_${Date.now()}.mp4`);
    
    // Use the correct setpts syntax for ffmpeg
    const command = `ffmpeg -i "${videoPath}" -filter:v "setpts=${extensionFactor}*PTS" -y "${outputPath}"`;
    
    console.log(`Running command: ${command}`);
    
    await new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error extending video duration: ${error.message}`);
          reject(error);
          return;
        }
        console.log(`Video extended successfully to ${outputPath}`);
        resolve(outputPath);
      });
    });
    
    // Verify the file was created
    if (!fs.existsSync(outputPath)) {
      throw new Error(`Extended video file was not created: ${outputPath}`);
    }
    
    return outputPath;
  } catch (error) {
    console.error('Error extending video duration:', error);
    throw error;
  }
}

/**
 * Adjust video duration to a target duration
 * @param {string} inputPath - Path to input video
 * @param {string} outputPath - Path for output video
 * @param {number} targetDuration - Target duration in seconds
 * @returns {Promise<string>} - Path to the adjusted video
 */
function adjustVideoDuration(inputPath, outputPath, targetDuration) {
  return new Promise((resolve, reject) => {
    const command = `ffmpeg -i "${inputPath}" -filter:v "setpts=(${targetDuration}/3.57)*PTS" -filter:a "atempo=(3.57/${targetDuration})" "${outputPath}"`;
    
    console.log('Executing ffmpeg command:', command);
    
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('Error executing ffmpeg:', error);
        return reject(error);
      }
      if (stderr) {
        console.error('ffmpeg stderr:', stderr);
      }
      console.log('ffmpeg stdout:', stdout);
      
      if (fs.existsSync(outputPath)) {
        console.log('Video duration adjusted successfully');
        resolve(outputPath);
      } else {
        console.error('Adjusted video file was not created');
        reject(new Error('Adjusted video file was not created'));
      }
    });
  });
}

/**
 * Combine audio files (dialogue and sound effects)
 * @param {string} dialoguePath - Path to dialogue audio
 * @param {string} soundEffectPath - Path to sound effect audio
 * @param {string} outputPath - Path for combined audio
 * @returns {Promise<string>} - Path to the combined audio
 */
async function combineAudioFiles(dialoguePath, soundEffectPath, outputPath) {
  return new Promise((resolve, reject) => {
    // If only one audio file is provided, just copy it to the output path
    if (!dialoguePath && !soundEffectPath) {
      reject(new Error('At least one audio file must be provided'));
      return;
    }
    
    if (!dialoguePath) {
      fs.copyFile(soundEffectPath, outputPath, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(outputPath);
        }
      });
      return;
    }
    
    if (!soundEffectPath) {
      fs.copyFile(dialoguePath, outputPath, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(outputPath);
        }
      });
      return;
    }
    
    // Check if files exist before trying to combine them
    if (!fs.existsSync(dialoguePath)) {
      console.error(`Dialogue file not found: ${dialoguePath}`);
      // Fall back to using just the sound effect
      if (fs.existsSync(soundEffectPath)) {
        fs.copyFile(soundEffectPath, outputPath, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve(outputPath);
          }
        });
        return;
      } else {
        reject(new Error(`Both audio files are missing: ${dialoguePath} and ${soundEffectPath}`));
        return;
      }
    }
    
    if (!fs.existsSync(soundEffectPath)) {
      console.error(`Sound effect file not found: ${soundEffectPath}`);
      // Fall back to using just the dialogue
      fs.copyFile(dialoguePath, outputPath, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(outputPath);
        }
      });
      return;
    }
    
    // If both audio files are provided, mix them together
    const command = `ffmpeg -i "${dialoguePath}" -i "${soundEffectPath}" -filter_complex "[0:a]volume=2.0[dialogue];[1:a]volume=0.75[sfx];[dialogue][sfx]amix=inputs=2:duration=longest" -c:a libmp3lame "${outputPath}"`;
    
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('Error combining audio files:', error);
        reject(error);
        return;
      }
      
      resolve(outputPath);
    });
  });
}

/**
 * Create a video with audio by combining multiple videos and audio tracks
 * @param {string[]} videoPaths - Array of video file paths
 * @param {string[]} audioPaths - Array of audio file paths
 * @param {string} outputPath - Path for the final video
 * @returns {Promise<void>}
 */
async function createVideoWithAudio(videoPaths, audioPaths, outputPath) {
  if (videoPaths.length !== audioPaths.length) {
    throw new Error('Number of video paths must match number of audio paths');
  }

  // Create temporary files for intermediate processing
  const tempFiles = [];
  const inputFiles = [];

  for (let i = 0; i < videoPaths.length; i++) {
    // First, get the duration of the audio file
    const audioDuration = await getMediaDuration(audioPaths[i]);
    console.log(`Audio ${i} duration: ${audioDuration}s`);
    
    // Get the duration of the video file
    const videoDuration = await getMediaDuration(videoPaths[i]);
    console.log(`Video ${i} duration: ${videoDuration}s`);
    
    // If audio is longer than video, extend the video
    let videoToUse = videoPaths[i];
    if (audioDuration > videoDuration) {
      console.log(`Audio is longer than video for scene ${i}. Extending video...`);
      // Use the refactored extendVideoDuration function which takes only videoPath and targetDuration
      const extendedVideoPath = await extendVideoDuration(videoPaths[i], audioDuration);
      videoToUse = extendedVideoPath;
      tempFiles.push(extendedVideoPath); // Add to temp files for cleanup later
    }
    
    const tempVideoWithAudio = path.resolve(process.cwd(), `temp_video_audio_${i}.mp4`);
    tempFiles.push(tempVideoWithAudio);

    // Verify that both video and audio files exist
    if (!fs.existsSync(videoToUse)) {
      console.error(`Video file not found: ${videoToUse}`);
      throw new Error(`Video file not found: ${videoToUse}`);
    }
    
    if (!fs.existsSync(audioPaths[i])) {
      console.error(`Audio file not found: ${audioPaths[i]}`);
      throw new Error(`Audio file not found: ${audioPaths[i]}`);
    }
    
    console.log(`Processing video ${i}: ${videoToUse} with audio ${audioPaths[i]}`);
    
    // Combine each video with its corresponding audio
    // Use double quotes around file paths to handle spaces and special characters
    await new Promise((resolve, reject) => {
      const command = `ffmpeg -i "${videoToUse}" -i "${audioPaths[i]}" -c:v copy -c:a aac -strict experimental "${tempVideoWithAudio}"`;
      console.log(`Executing command: ${command}`);
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error processing video ${i}:`, error);
          reject(error);
        } else {
          console.log(`Processed video ${i} successfully`);
          resolve();
        }
      });
    });

    inputFiles.push(`-i "${tempVideoWithAudio}"`);
  }

  // Concatenate all temporary video files
  const inputFilesString = inputFiles.join(' ');
  const filterComplex = `concat=n=${videoPaths.length}:v=1:a=1[outv][outa]`;
  
  const finalCommand = `ffmpeg ${inputFilesString} -filter_complex "${filterComplex}" -map "[outv]" -map "[outa]" "${outputPath}"`;
  console.log(`Executing final command: ${finalCommand}`);

  return new Promise((resolve, reject) => {
    exec(finalCommand, (error, stdout, stderr) => {
      if (error) {
        console.error('Error creating final video with audio:', error);
        reject(error);
      } else {
        console.log('Final video with audio created successfully');
        resolve();
      }
    }).on('close', async () => {
      // Clean up temporary files
      for (const tempFile of tempFiles) {
        try {
          await fs.promises.unlink(tempFile);
          console.log(`Deleted temporary file: ${tempFile}`);
        } catch (unlinkError) {
          console.error(`Error deleting temporary file ${tempFile}:`, unlinkError);
        }
      }
    });
  });
}

/**
 * Save video data to a file
 * @param {object|string} videoData - Video data or URL
 * @param {string} filePath - Path to save the video
 * @returns {Promise<string>} - Path to the saved video
 */
async function saveVideoToFile(videoData, filePath) {
  console.log(`Downloading video from: ${videoData.data?.video?.url || videoData}`);
  
  // Ensure the directory exists
  const directory = path.dirname(filePath);
  if (!fs.existsSync(directory)) {
    await fs.promises.mkdir(directory, { recursive: true });
  }
  
  // Handle different input formats (URL string or video data object)
  if (typeof videoData === 'string') {
    // Handle direct URL
    const writer = fs.createWriteStream(filePath);
    try {
      const response = await axios({
        url: videoData,
        method: 'GET',
        responseType: 'stream'
      });
      
      response.data.pipe(writer);
      
      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          console.log(`Successfully saved video to ${filePath}`);
          resolve(filePath);
        });
        writer.on('error', (err) => {
          console.error(`Error writing video to file ${filePath}:`, err);
          reject(err);
        });
      });
    } catch (error) {
      console.error(`Error downloading video from ${videoData}:`, error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response headers:', error.response.headers);
      }
      throw error;
    }
  } else {
    // Handle video data object from fal.ai
    try {
      const videoUrl = videoData.data.video.url;
      const response = await axios.get(videoUrl, { responseType: 'arraybuffer' });
      await fs.promises.writeFile(filePath, Buffer.from(response.data));
      console.log(`Successfully saved video to ${filePath}`);
      
      // Verify file was created
      if (!fs.existsSync(filePath)) {
        throw new Error(`File was not created at ${filePath}`);
      }
      return filePath;
    } catch (error) {
      console.error('Error saving video to file:', error);
      throw error;
    }
  }
}

module.exports = {
  getMediaDuration,
  extendVideoDuration,
  adjustVideoDuration,
  combineAudioFiles,
  createVideoWithAudio,
  saveVideoToFile
};
