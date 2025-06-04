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
  // Safety check to ensure filePath is a string
  if (typeof filePath !== 'string') {
    console.error(`Invalid file path: ${filePath} (type: ${typeof filePath})`);
    return Promise.reject(new Error(`Invalid file path: ${filePath} (type: ${typeof filePath})`));
  }
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.error(`File does not exist: ${filePath}`);
    return Promise.reject(new Error(`File does not exist: ${filePath}`));
  }
  
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
    // Checking video and target durations
    
    // If the difference is very small (less than 0.1 seconds), don't bother extending
    if (Math.abs(targetDuration - videoDuration) < 0.1) {
      console.log('Video duration is close enough to target, no extension needed');
      return videoPath;
    }
    
    if (videoDuration >= targetDuration) {
      console.log('Video duration is already sufficient, no extension needed');
      return videoPath;
    }
    
    // Limit the extension factor to a reasonable range (1.0 to 5.0)
    // This prevents extreme slowdowns that might cause issues
    const extensionFactor = Math.min(5.0, Math.max(1.0, targetDuration / videoDuration));
    // Calculating extension factor
    
    // Create a properly formatted output path
    const outputPath = path.join(path.dirname(videoPath), `extended_video_${Date.now()}.mp4`);
    
    // Use a simpler approach with fewer options to reduce potential issues
    const command = `ffmpeg -i "${videoPath}" -filter:v "setpts=${extensionFactor}*PTS" -c:v libx264 -preset fast -y "${outputPath}"`;
    
    // Command execution (verbose logging removed)
    
    return new Promise((resolve, reject) => {
      exec(command, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error extending video duration: ${error.message}`);
          console.error('Falling back to original video');
          resolve(videoPath); // Fall back to original video instead of failing
          return;
        }
        
        // Check if the output file exists and has a non-zero size
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
          console.log(`Video extended successfully to ${outputPath}`);
          resolve(outputPath);
        } else {
          console.error(`Extended video file was not created properly: ${outputPath}`);
          console.error('Falling back to original video');
          resolve(videoPath); // Fall back to original video
        }
      });
    });
  } catch (error) {
    console.error('Error extending video duration:', error);
    console.error('Falling back to original video');
    return videoPath; // Fall back to original video instead of failing
  }
}

/**
 * Adjust video duration to a target duration
 * @param {string} inputPath - Path to input video
 * @param {number} targetDuration - Target duration in seconds
 * @param {number} [correctionFactor=null] - Optional correction factor for more precise adjustments
 * @param {boolean} [forceExactDuration=false] - If true, forces the output to be exactly the target duration
 * @returns {Promise<string>} - Path to the adjusted video
 */
async function adjustVideoDuration(inputPath, targetDuration, correctionFactor = null, forceExactDuration = false) {
  try {
    // Ensure targetDuration is a valid number
    if (typeof targetDuration !== 'number' || isNaN(targetDuration) || targetDuration <= 0) {
      console.error(`Invalid target duration: ${targetDuration}`);
      throw new Error(`Invalid target duration: ${targetDuration}`);
    }

    // Get the actual video duration
    const videoDuration = await getMediaDuration(inputPath);
    console.log(`Current video duration: ${videoDuration}s, Target duration: ${targetDuration}s`);
    
    // If the difference is very small (less than 0.1 seconds), don't bother adjusting
    if (Math.abs(targetDuration - videoDuration) < 0.1) {
      console.log('Video duration is close enough to target, no adjustment needed');
      return inputPath;
    }
    
    // Create a properly formatted output path
    const outputPath = path.join(path.dirname(inputPath), `adjusted_video_${Date.now()}.mp4`);
    
    // Calculate the setpts factor to adjust video speed
    // If a correction factor is provided, apply it for more precise adjustment
    let setPtsFactor = targetDuration / videoDuration;
    if (correctionFactor) {
      setPtsFactor = setPtsFactor * correctionFactor;
      console.log(`Applying correction factor ${correctionFactor.toFixed(4)}, adjusted factor: ${setPtsFactor.toFixed(4)}`);
    }
    console.log(`Adjusting video speed by factor: ${setPtsFactor.toFixed(4)}`);
    
    // Build the ffmpeg command based on whether we want to force exact duration
    let command;
    if (forceExactDuration) {
      // Force exact duration using -t parameter
      command = `ffmpeg -y -i "${inputPath}" -filter:v "setpts=${setPtsFactor}*PTS" -c:v libx264 -preset medium -crf 22 -t ${targetDuration} "${outputPath}"`;
      console.log(`Forcing exact duration of ${targetDuration}s`);
    } else {
      // Standard approach - adjust speed only
      command = `ffmpeg -y -i "${inputPath}" -filter:v "setpts=${setPtsFactor}*PTS" -c:v libx264 -preset medium -crf 22 "${outputPath}"`;
    }
    
    console.log(`Running command: ${command}`);
    // Command execution
    
    return new Promise((resolve, reject) => {
      exec(command, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error adjusting video duration: ${error.message}`);
          console.error('Falling back to original video');
          resolve(inputPath); // Fall back to original video instead of failing
          return;
        }
        
        // Check if the output file exists and has a non-zero size
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
          console.log(`Video adjusted successfully to ${outputPath}`);
          resolve(outputPath);
        } else {
          console.error(`Adjusted video file was not created properly: ${outputPath}`);
          console.error('Falling back to original video');
          resolve(inputPath); // Fall back to original video
        }
      });
    });
  } catch (error) {
    console.error('Error adjusting video duration:', error);
    console.error('Falling back to original video');
    return inputPath; // Fall back to original video instead of failing
  }
}

/**
 * Combine two audio files into one
 * @param {string} dialoguePath - Path to the dialogue audio file
 * @param {string} soundEffectPath - Path to the sound effect audio file
 * @param {string} outputPath - Path for the combined audio file
 * @param {number} [maxDuration=null] - Optional maximum duration for the combined audio
 * @returns {Promise<string>} - Path to the combined audio file
 */
async function combineAudioFiles(dialoguePath, soundEffectPath, outputPath, maxDuration = null) {
  return new Promise(async (resolve, reject) => {
    try {
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
        reject(new Error(`Dialogue file not found: ${dialoguePath}`));
        return;
      }
      
      if (!fs.existsSync(soundEffectPath)) {
        reject(new Error(`Sound effect file not found: ${soundEffectPath}`));
        return;
      }
      
      // Both files exist, proceed with combining them
      
      // Get the dialogue duration
      const dialogueDuration = await getMediaDuration(dialoguePath);
      console.log(`Dialogue duration: ${dialogueDuration}s`);
      
      // If maxDuration is specified and dialogue is already longer, speed up dialogue first
      let dialogueToUse = dialoguePath;
      if (maxDuration && dialogueDuration > maxDuration) {
        console.log(`Dialogue exceeds max duration (${maxDuration}s). Speeding up dialogue first...`);
        dialogueToUse = await speedUpAudio(dialoguePath, maxDuration);
        console.log(`Dialogue sped up to match max duration`);
      }
      
      // Create temporary WAV files for better mixing compatibility
      const tempDialoguePath = `${dialogueToUse}.temp.wav`;
      const tempSoundEffectPath = `${soundEffectPath}.temp.wav`;
      
      // Convert both files to WAV format for reliable mixing
      const convertDialogueCmd = `ffmpeg -y -i "${dialogueToUse}" "${tempDialoguePath}"`;
      const convertSoundEffectCmd = `ffmpeg -y -i "${soundEffectPath}" "${tempSoundEffectPath}"`;
      
      console.log('Converting audio files to WAV for mixing...');
      
      // Execute the conversion commands
      exec(convertDialogueCmd, (dialogueErr) => {
        if (dialogueErr) {
          console.error('Error converting dialogue to WAV:', dialogueErr);
          // Fall back to just using dialogue
          fs.copyFile(dialogueToUse, outputPath, (err) => {
            if (err) {
              reject(err);
            } else {
              console.log(`Falling back to dialogue only for ${outputPath}`);
              resolve(outputPath);
            }
          });
          return;
        }
        
        exec(convertSoundEffectCmd, (soundEffectErr) => {
          if (soundEffectErr) {
            console.error('Error converting sound effect to WAV:', soundEffectErr);
            // Fall back to just using dialogue
            fs.copyFile(dialogueToUse, outputPath, (err) => {
              if (err) {
                reject(err);
              } else {
                console.log(`Falling back to dialogue only for ${outputPath}`);
                resolve(outputPath);
              }
            });
            return;
          }
          
          // Both conversions successful, now mix the WAV files
          // Increase sound effect volume for better audibility while keeping dialogue clear
          const mixCommand = `ffmpeg -y -i "${tempDialoguePath}" -i "${tempSoundEffectPath}" -filter_complex "[0:a]volume=1.5[dialogue];[1:a]volume=0.8[sfx];[dialogue][sfx]amix=inputs=2:duration=longest" -c:a libmp3lame -b:a 192k "${outputPath}"`;
          
          console.log('Mixing audio files with enhanced sound effects...');
          
          exec(mixCommand, (mixErr, stdout, stderr) => {
            // Clean up temporary WAV files regardless of outcome
            try {
              if (fs.existsSync(tempDialoguePath)) fs.unlinkSync(tempDialoguePath);
              if (fs.existsSync(tempSoundEffectPath)) fs.unlinkSync(tempSoundEffectPath);
            } catch (cleanupErr) {
              console.error('Error cleaning up temporary WAV files:', cleanupErr);
            }
            
            if (mixErr) {
              console.error('Error mixing audio files:', mixErr);
              // Fall back to just using dialogue
              fs.copyFile(dialogueToUse, outputPath, (err) => {
                if (err) {
                  reject(err);
                } else {
                  console.log(`Falling back to dialogue only for ${outputPath}`);
                  resolve(outputPath);
                }
              });
            } else {
              console.log(`Successfully mixed audio for ${outputPath}`);
              resolve(outputPath);
            }
          });
        });
      });
    } catch (error) {
      console.error('Error in combineAudioFiles:', error);
      reject(error);
    }
  });
}

/**
 * Create a video with audio by combining multiple videos and audio tracks
 * @param {string[]} videoPaths - Array of video file paths
 * @param {string[]} audioPaths - Array of audio file paths
 * @param {string} outputPath - Path for the final video
 * @returns {Promise<string>} - Path to the final video
 */
async function createVideoWithAudio(videoPaths, audioPaths, outputPath) {
  try {
    if (videoPaths.length !== audioPaths.length) {
      throw new Error('Number of video paths must match number of audio paths');
    }

    // Validate inputs to prevent errors
    const validVideos = [];
    const validAudios = [];
    
    // Filter out any invalid paths
    for (let i = 0; i < videoPaths.length; i++) {
      if (!videoPaths[i] || !fs.existsSync(videoPaths[i])) {
        console.warn(`Skipping invalid video path at index ${i}: ${videoPaths[i]}`);
        continue;
      }
      
      if (!audioPaths[i] || !fs.existsSync(audioPaths[i])) {
        console.warn(`Skipping invalid audio path at index ${i}: ${audioPaths[i]}`);
        continue;
      }
      
      validVideos.push(videoPaths[i]);
      validAudios.push(audioPaths[i]);
    }
    
    if (validVideos.length === 0) {
      throw new Error('No valid video/audio pairs found');
    }

    // Create temporary files for intermediate processing
    const tempFiles = [];
    const inputFiles = [];
    const successfulScenes = [];

    for (let i = 0; i < validVideos.length; i++) {
      try {
        // Get the duration of the audio file
        const audioDuration = await getMediaDuration(validAudios[i]);
        console.log(`Audio ${i} duration: ${audioDuration}s`);
        
        // Get the duration of the video file
        const videoDuration = await getMediaDuration(validVideos[i]);
        console.log(`Video ${i} duration: ${videoDuration}s`);
        
        // If audio is longer than video, extend the video
        let videoToUse = validVideos[i];
        if (audioDuration > videoDuration) {
          console.log(`Audio is longer than video for scene ${i}. Extending video...`);
          try {
            const extendedVideoPath = await extendVideoDuration(validVideos[i], audioDuration);
            videoToUse = extendedVideoPath;
            tempFiles.push(extendedVideoPath);
          } catch (error) {
            console.error(`Error extending video for scene ${i}:`, error);
            console.log(`Using original video for scene ${i}`);
          }
        }
        
        const tempVideoWithAudio = path.resolve(process.cwd(), `temp_video_audio_${i}.mp4`);
        tempFiles.push(tempVideoWithAudio);
        
        console.log(`Processing video ${i}: ${videoToUse} with audio ${validAudios[i]}`);
        
        // Process with increased buffer size and timeout
        try {
          await new Promise((resolve, reject) => {
            // Add -y flag to force overwrite existing files without prompting
            const command = `ffmpeg -y -i "${videoToUse}" -i "${validAudios[i]}" -c:v copy -c:a aac -strict experimental "${tempVideoWithAudio}"`;
            console.log(`Executing command: ${command}`);
            
            const process = exec(command, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
              if (error) {
                console.error(`Error processing video ${i}:`, error);
                reject(error);
              } else {
                console.log(`Processed video ${i} successfully`);
                resolve();
              }
            });
            
            // Set a timeout to prevent hanging
            const timeout = setTimeout(() => {
              console.error(`Command timed out for video ${i}`);
              process.kill();
              reject(new Error('Command timed out'));
            }, 60000); // 60 second timeout
            
            process.on('exit', () => clearTimeout(timeout));
          });
          
          // Verify the file was created successfully
          if (fs.existsSync(tempVideoWithAudio) && fs.statSync(tempVideoWithAudio).size > 0) {
            inputFiles.push(`-i "${tempVideoWithAudio}"`);
            successfulScenes.push(i);
          } else {
            console.error(`Failed to create temp video with audio for scene ${i}`);
          }
        } catch (error) {
          console.error(`Error processing video ${i} with audio:`, error);
        }
      } catch (error) {
        console.error(`Error processing scene ${i}:`, error);
      }
    }

    if (successfulScenes.length === 0) {
      throw new Error('No scenes were successfully processed');
    }

    // Concatenate all temporary video files
    const inputFilesString = inputFiles.join(' ');
    const filterComplex = `concat=n=${successfulScenes.length}:v=1:a=1[outv][outa]`;
    
    // Add -y flag to force overwrite existing files without prompting
    const finalCommand = `ffmpeg -y ${inputFilesString} -filter_complex "${filterComplex}" -map "[outv]" -map "[outa]" "${outputPath}"`;
    console.log(`Executing final command: ${finalCommand}`);

    return new Promise((resolve, reject) => {
      const process = exec(finalCommand, { maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          console.error('Error creating final video with audio:', error);
          
          // If we have at least one successful scene, return the first one as a fallback
          if (successfulScenes.length > 0) {
            const fallbackPath = `temp_video_audio_${successfulScenes[0]}.mp4`;
            console.log(`Falling back to first successful scene: ${fallbackPath}`);
            fs.copyFileSync(fallbackPath, outputPath);
            resolve(outputPath);
          } else {
            reject(error);
          }
        } else {
          console.log('Final video with audio created successfully');
          resolve(outputPath);
        }
      });
      
      // Set a timeout for the final concatenation
      const timeout = setTimeout(() => {
        console.error('Final command timed out');
        process.kill();
        
        // If we have at least one successful scene, return the first one as a fallback
        if (successfulScenes.length > 0) {
          const fallbackPath = `temp_video_audio_${successfulScenes[0]}.mp4`;
          console.log(`Falling back to first successful scene due to timeout: ${fallbackPath}`);
          fs.copyFileSync(fallbackPath, outputPath);
          resolve(outputPath);
        } else {
          reject(new Error('Final command timed out'));
        }
      }, 120000); // 2 minute timeout
      
      process.on('exit', () => clearTimeout(timeout));
    });
  } catch (error) {
    console.error('Error in createVideoWithAudio:', error);
    throw error;
  }
}

/**
 * Save video data to a file
 * @param {object|string} videoData - Video data or URL
 * @param {string} filePath - Path to save the video
 * @returns {Promise<string>} - Path to the saved video
 */
async function saveVideoToFile(videoData, filePath) {
  // Extract URL from different possible formats
  let videoUrl;
  
  if (typeof videoData === 'string') {
    videoUrl = videoData;
  } else if (videoData.url) {
    // Kling Video v2 model format
    videoUrl = videoData.url;
  } else if (videoData.data?.video?.url) {
    // Original model format
    videoUrl = videoData.data.video.url;
  } else if (videoData.videoData?.url) {
    // Another possible format
    videoUrl = videoData.videoData.url;
  } else if (typeof videoData.videoData === 'string') {
    // Direct URL string format
    videoUrl = videoData.videoData;
  } else {
    console.error('Unknown video data format:', videoData);
    throw new Error('Unknown video data format');
  }
  
  console.log(`Downloading video from: ${videoUrl}`);
  
  // Ensure the directory exists
  const directory = path.dirname(filePath);
  if (!fs.existsSync(directory)) {
    await fs.promises.mkdir(directory, { recursive: true });
  }
  
  // Download the video
  const writer = fs.createWriteStream(filePath);
  try {
    const response = await axios({
      url: videoUrl,
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
    console.error(`Error downloading video from ${videoUrl}:`, error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response headers:', error.response.headers);
    }
    throw error;
  }
  
  // Verify file was created
  if (!fs.existsSync(filePath)) {
    throw new Error(`File was not created at ${filePath}`);
  }
  return filePath;
}

/**
 * Speed up audio if it's longer than the maximum duration
 * @param {string} audioPath - Path to the audio file
 * @param {number} maxDuration - Maximum duration in seconds
 * @returns {Promise<string>} - Path to the adjusted audio file
 */
async function speedUpAudio(audioPath, maxDuration) {
  try {
    const audioDuration = await getMediaDuration(audioPath);
    
    // If the difference is very small (less than 0.1 seconds), don't bother speeding up
    if (audioDuration <= maxDuration || Math.abs(audioDuration - maxDuration) < 0.1) {
      console.log(`Audio duration (${audioDuration}s) is already within max duration (${maxDuration}s)`);
      return audioPath;
    }
    
    // Checking audio and max durations
    
    // Limit the tempo factor to a reasonable range (1.0 to 2.0)
    // Extremely high tempo factors can cause audio quality issues
    const tempoFactor = Math.min(2.0, Math.max(1.0, audioDuration / maxDuration));
    // Calculating speed factor
    
    const outputPath = path.join(path.dirname(audioPath), `sped_up_audio_${Date.now()}.mp3`);
    
    // Use a more robust command with error handling
    // For tempo factors > 2.0, chain multiple atempo filters (each limited to 0.5-2.0 range)
    let filterCommand;
    if (tempoFactor <= 2.0) {
      filterCommand = `-filter:a "atempo=${tempoFactor.toFixed(6)}"`;  // More precise decimal
    } else {
      // For higher factors, chain multiple atempo filters (each max 2.0)
      // e.g., for 2.5x speed, use atempo=2.0,atempo=1.25
      const firstFactor = 2.0;
      const secondFactor = tempoFactor / 2.0;
      filterCommand = `-filter:a "atempo=${firstFactor.toFixed(1)},atempo=${secondFactor.toFixed(6)}"`;  
    }
    
    const command = `ffmpeg -i "${audioPath}" ${filterCommand} -y "${outputPath}"`;
    // Command execution (verbose logging removed)
    
    return new Promise((resolve, reject) => {
      exec(command, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error speeding up audio: ${error.message}`);
          console.error('Falling back to original audio');
          resolve(audioPath); // Fall back to original audio instead of failing
          return;
        }
        
        // Check if the output file exists and has a non-zero size
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
          console.log(`Audio sped up successfully to ${outputPath}`);
          
          // Verify the new duration
          getMediaDuration(outputPath).then(newDuration => {
            // New audio duration calculated
            resolve(outputPath);
          }).catch(err => {
            console.error(`Error getting new audio duration: ${err.message}`);
            resolve(outputPath); // Still return the output path even if we can't verify duration
          });
        } else {
          console.error(`Sped up audio file was not created properly: ${outputPath}`);
          console.error('Falling back to original audio');
          resolve(audioPath); // Fall back to original audio
        }
      });
    });
  } catch (error) {
    console.error('Error speeding up audio:', error);
    console.error('Falling back to original audio');
    return audioPath; // Fall back to original audio instead of failing
  }
}

/**
 * Trim audio to a specific duration
 * @param {string} audioPath - Path to the audio file
 * @param {number} targetDuration - Target duration in seconds
 * @param {string} [outputPath=null] - Optional custom output path
 * @returns {Promise<string>} - Path to the trimmed audio file
 */
async function trimAudio(audioPath, targetDuration, outputPath = null) {
  try {
    const audioDuration = await getMediaDuration(audioPath);
    
    // If the audio is already shorter than the target duration, no need to trim
    if (audioDuration <= targetDuration) {
      console.log(`Audio duration (${audioDuration}s) is already shorter than target duration (${targetDuration}s)`);
      return audioPath;
    }
    
    console.log(`Trimming audio from ${audioDuration}s to ${targetDuration}s`);
    
    // Create a more compatible output path with MP3 extension if not provided
    const finalOutputPath = outputPath || path.join(path.dirname(audioPath), `trimmed_audio_${Date.now()}.mp3`);
    
    // Use a more precise ffmpeg command to trim audio to the exact duration
    // Use -af atrim to get precise trimming and asetpts to reset timestamps
    const command = `ffmpeg -y -i "${audioPath}" -af "atrim=0:${targetDuration},asetpts=PTS-STARTPTS" -c:a libmp3lame -b:a 192k "${finalOutputPath}"`;
    
    console.log(`Running command: ${command}`);
    
    return new Promise((resolve, reject) => {
      exec(command, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error trimming audio: ${error.message}`);
          console.error('Falling back to original audio');
          resolve(audioPath); // Fall back to original audio instead of failing
          return;
        }
        
        // Check if the output file exists and has a non-zero size
        if (fs.existsSync(finalOutputPath) && fs.statSync(finalOutputPath).size > 0) {
          console.log(`Audio trimmed successfully to ${finalOutputPath}`);
          
          // Verify the new duration
          getMediaDuration(finalOutputPath).then(newDuration => {
            console.log(`New audio duration after trimming: ${newDuration}s`);
            resolve(finalOutputPath);
          }).catch(err => {
            console.error(`Error getting new audio duration: ${err.message}`);
            resolve(finalOutputPath); // Still return the output path even if we can't verify duration
          });
        } else {
          console.error(`Trimmed audio file was not created properly: ${finalOutputPath}`);
          console.error('Falling back to original audio');
          resolve(audioPath); // Fall back to original audio
        }
      });
    });
  } catch (error) {
    console.error('Error trimming audio:', error);
    console.error('Falling back to original audio');
    return audioPath; // Fall back to original audio instead of failing
  }
}

module.exports = {
  getMediaDuration,
  extendVideoDuration,
  adjustVideoDuration,
  combineAudioFiles,
  createVideoWithAudio,
  saveVideoToFile,
  speedUpAudio,
  trimAudio
};
