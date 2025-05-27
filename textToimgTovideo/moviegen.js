const axios = require('axios');
const fs = require('fs');
const { exec } = require('child_process');
const tus = require('tus-js-client');
const FormData = require('form-data');
const dotenv = require('dotenv');

const { ElevenLabsClient, ElevenLabs } = require("elevenlabs");
const path = require('path');
const { fal } = require('@fal-ai/client');

const { API_URL, AI_API_URL } = require('./constants');

// Load environment variables
dotenv.config();

const API_KEY = process.env.LIVEPEER_API_KEY;
const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });

// Initialize fal.ai client with credentials
fal.config({
  credentials: process.env.FAL_AI_KEY
});

const MAX_RETRIES = 250;
const RETRY_DELAY = 5000; // 5 seconds

// New function to generate video directly from text using fal.ai
async function generateVideoFromText(prompt, duration, retryCount = 0) {
  try {
    console.log('Calling fal.ai text-to-video API...');
    
    // Calculate num_frames based on duration (assuming 24fps)
    const fps = 24;
    const numFrames = Math.min(Math.ceil(duration * fps), 48); // fal.ai max is 48 frames
    
    // Add portrait orientation hints to the prompt
    const enhancedPrompt = `${prompt} (vertical format, portrait orientation)`;
    console.log(`Using portrait-enhanced prompt: ${enhancedPrompt}`);
    
    // Go back to the original working model and parameters
    // But use portrait dimensions (width < height)
    console.log('Generating portrait video with dimensions 512x768');
    
    // Use the model that we know works, but with portrait dimensions
    const result = await fal.run('fal-ai/fast-svd/text-to-video', {
      input: {
        prompt: enhancedPrompt,
        negative_prompt: 'poor quality, distortion, low resolution, blurry, text, watermark, landscape orientation, wide format',
        num_frames: numFrames,
        width: 512,     // Width smaller than height for portrait
        height: 768,    // Height larger than width for portrait
        guidance_scale: 7.5,
        num_inference_steps: 25,
        fps: fps
      }
    });
    
    console.log('Video generation parameters:', {
      prompt: enhancedPrompt,
      dimensions: '512x768', // Portrait dimensions
      fps: fps,
      duration: duration,
      frames: numFrames
    });
    
    // Log the full response for debugging
    console.log('Full API response:', JSON.stringify(result, null, 2));
    
    console.log('Video generated successfully from fal.ai');
    console.log('Result data:', result);
    
    // Extract the video URL from the response
    if (result && result.data && result.data.video && result.data.video.url) {
      return result.data.video.url; // Standard video output format from fal.ai
    } else if (result && result.video && result.video.url) {
      return result.video.url; // Alternative video output format
    } else if (result && result.images && result.images.length > 0) {
      return result.images[0].url; // For image output
    } else if (result && result.output && result.output.video) {
      return result.output.video; // Alternative video output structure
    } else {
      console.error('Unexpected response structure from fal.ai:', JSON.stringify(result, null, 2));
      throw new Error('Could not extract video URL from fal.ai response');
    }
  } catch (error) {
    console.error(`Error generating video from text (attempt ${retryCount + 1}):`, error.message);
    
    if (retryCount < MAX_RETRIES) {
      console.log(`Retrying in ${RETRY_DELAY / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return generateVideoFromText(prompt, duration, retryCount + 1);
    }
    
    throw error;
  }
}

// Function to save video data to a file
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
          resolve();
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

async function generateAIImage(prompt, retryCount = 0) {
  try {
    const options = {
      method: 'POST',
      url: AI_API_URL,
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      data: {
        model_id: "SG161222/RealVisXL_V4.0_Lightning",
        prompt: prompt,
        width: 576,
        height: 1024
      }
    };

    const response = await axios(options);
    return response.data;
  } catch (error) {
    console.error(`Error generating AI image (attempt ${retryCount + 1}):`, error.message);
    
    if (retryCount < MAX_RETRIES) {
      console.log(`Retrying in ${RETRY_DELAY / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return generateAIImage(prompt, retryCount + 1);
    }
    
    throw error;
  }
}

async function downloadAIImage(imageUrl, filePath) {
  // Remove the incorrect part of the URL
  const correctedUrl = imageUrl.replace('https://dream-gateway.livepeer.cloud:', '');

  console.log(`Attempting to download from: ${correctedUrl}`);

  const writer = fs.createWriteStream(filePath);
  try {
    const response = await axios({
      url: correctedUrl,
      method: 'GET',
      responseType: 'stream'
    });
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        console.log(`Successfully downloaded to ${filePath}`);
        resolve();
      });
      writer.on('error', (err) => {
        console.error(`Error writing to file ${filePath}:`, err);
        reject(err);
      });
    });
  } catch (error) {
    console.error(`Error downloading from ${correctedUrl}:`, error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response headers:', error.response.headers);
    }
    throw error;
  }
}

function createVideoFromImages(imagePaths, outputPath, durations) {
  return new Promise((resolve, reject) => {
    const inputFiles = imagePaths.map((path, index) => `-loop 1 -t ${durations[index]} -i ${path}`).join(' ');
    const filterComplex = imagePaths.map((_, index) => 
  `[${index}:v]scale=576:1024:force_original_aspect_ratio=decrease,pad=576:1024:(ow-iw)/2:(oh-ih)/2[v${index}];`).join('');
    const filterComplexConcat = imagePaths.map((_, index) => `[v${index}]`).join('') + `concat=n=${imagePaths.length}:v=1:a=0[outv]`;
    
    const command = `ffmpeg -y ${inputFiles} -filter_complex "${filterComplex}${filterComplexConcat}" -map "[outv]" -c:v libx264 -pix_fmt yuv420p ${outputPath}`;
    
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
        console.log('Video file created successfully');
        resolve(outputPath);
      } else {
        console.error('Video file was not created');
        reject(new Error('Video file was not created'));
      }
    });
  });
}

function uploadVideoToLivepeer(filePath) {
  return new Promise(async (resolve, reject) => {
    try {
      console.log('Requesting upload URL from Livepeer...');
      const requestUploadResponse = await axios.post(`${API_URL}/asset/request-upload`, 
        { name: "AI Generated Movie Scene" },
        {
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('Request upload response:', JSON.stringify(requestUploadResponse.data, null, 2));

      const tusEndpoint = requestUploadResponse.data.tusEndpoint;

      console.log('Starting Tus upload...');
      const file = fs.createReadStream(filePath);
      const size = fs.statSync(filePath).size;

      const upload = new tus.Upload(file, {
        endpoint: tusEndpoint,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        metadata: {
          filename: 'movie_scene.mp4',
          filetype: 'video/mp4'
        },
        uploadSize: size,
        onError: function(error) {
          console.error("Upload failed:", error);
          console.error("Error details:", JSON.stringify(error, null, 2));
          reject(error);
        },
        onProgress: function(bytesUploaded, bytesTotal) {
          const percentage = ((bytesUploaded / bytesTotal) * 100).toFixed(2);
          console.log(`Uploaded ${bytesUploaded} of ${bytesTotal} bytes (${percentage}%)`);
        },
        onSuccess: function() {
          console.log("Upload finished:", upload.url);
          const assetId = requestUploadResponse.data.asset.id;
          const playbackId = requestUploadResponse.data.asset.playbackId;
          const playbackUrl = `https://lvpr.tv/?v=${playbackId}`;
          console.log('Playback URL:', playbackUrl);
          resolve(playbackUrl);
        }
      });

      upload.start();

    } catch (error) {
      console.error('Error in upload process:', error);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data, null, 2));
        console.error('Response headers:', JSON.stringify(error.response.headers, null, 2));
      }
      reject(error);
    }
  });
}

function adjustVideoDuration(inputPath, outputPath, targetDuration) {
  return new Promise((resolve, reject) => {
    const command = `ffmpeg -i ${inputPath} -filter:v "setpts=(${targetDuration}/3.57)*PTS" -filter:a "atempo=(3.57/${targetDuration})" ${outputPath}`;
    
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

// Function to get the duration of a media file (audio or video)
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

// Function to extend video duration to match audio length
async function extendVideoDuration(inputPath, outputPath, targetDuration) {
  return new Promise((resolve, reject) => {
    // Use ffmpeg to extend the video by slowing it down
    const command = `ffmpeg -i "${inputPath}" -filter:v "setpts=${targetDuration}*(PTS/PTSDURATION)" -y "${outputPath}"`;
    console.log(`Extending video duration with command: ${command}`);
    
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('Error extending video duration:', error);
        return reject(error);
      }
      
      if (fs.existsSync(outputPath)) {
        console.log(`Video extended to ${targetDuration}s successfully`);
        resolve(outputPath);
      } else {
        console.error('Extended video file was not created');
        reject(new Error('Extended video file was not created'));
      }
    });
  });
}

async function generateMovieScene(sceneData) {
  console.log('Starting parallel processing of scenes...');

  const generateSceneContent = async (scene, index) => {
    console.log(`Processing scene ${index + 1}/${sceneData.scenes.length}...`);

    // Use fal.ai fast-svd-lcm/text-to-video to generate video content
    console.log(`Generating video for prompt: ${scene.prompt}`);
    const videoData = await generateVideoFromText(scene.prompt, scene.duration);
    
    // Save the video to a local file with absolute path
    const videoPath = path.resolve(process.cwd(), `ai_generated_video_${index}_${Date.now()}.mp4`);
    await saveVideoToFile(videoData, videoPath);
    
    // Verify the file was created
    if (!fs.existsSync(videoPath)) {
      console.error(`Video file was not created at ${videoPath}`);
      throw new Error(`Failed to save video file at ${videoPath}`);
    }
    
    return {
      videoPath: videoPath,
      duration: scene.duration
    };
  };

  // Start both video and audio generation in parallel
  console.log('Starting video and audio generation in parallel...');
  
  // Start audio generation process
  const audioPromise = generateSceneAudio(sceneData);
  
  // Process all video scenes
  const videoPromises = [];
  for (let i = 0; i < sceneData.scenes.length; i++) {
    videoPromises.push(generateSceneContent(sceneData.scenes[i], i));
  }
  
  // Wait for all videos to be generated
  const sceneResults = await Promise.all(videoPromises);
  console.log('All videos generated successfully');
  
  // Wait for audio generation to complete
  const audioResults = await audioPromise;
  console.log('All audio generated successfully');
  
  console.log('Creating final video with audio...');
  const finalVideoPath = `final_movie_${Date.now()}.mp4`;
  await createVideoWithAudio(
    sceneResults.map(result => result.videoPath),
    audioResults.map(result => result.combinedAudioPath),
    finalVideoPath
  );

  console.log('Uploading video to Livepeer...');
  const playbackUrl = await uploadVideoToLivepeer(finalVideoPath);
  console.log('Movie scene generated and uploaded successfully!');
  console.log('You can view your video at:', playbackUrl);

  // Clean up temporary files
  try {
    // Clean up video files
    for (const result of sceneResults) {
      if (result.videoPath) {
        await fs.promises.unlink(result.videoPath);
      }
    }
    
    // Clean up audio files
    for (const result of audioResults) {
      if (result.dialoguePath) {
        await fs.promises.unlink(result.dialoguePath);
      }
      if (result.soundEffectPath) {
        await fs.promises.unlink(result.soundEffectPath);
      }
      if (result.combinedAudioPath && 
          result.combinedAudioPath !== result.dialoguePath && 
          result.combinedAudioPath !== result.soundEffectPath) {
        await fs.promises.unlink(result.combinedAudioPath);
      }
    }
    
    // Don't delete the final video as it's needed for the playback URL
    // await fs.promises.unlink(finalVideoPath);
  } catch (error) {
    console.error('Error cleaning up temporary files:', error);
  }

  return playbackUrl;
}

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
        await generateDialogue({
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
        await generateSoundEffect(scene.soundEffect, soundEffectPath);
        console.log(`Sound effect audio for scene ${i + 1} generated successfully`);
      }
      
      // Combine dialogue and sound effect if both exist
      let combinedAudioPath = null;
      if (dialoguePath && soundEffectPath) {
        combinedAudioPath = path.resolve(process.cwd(), `combined_audio_${i}_${Date.now()}.mp3`);
        await combineAudioFiles(dialoguePath, soundEffectPath, combinedAudioPath);
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

// Also update the combineAudioFiles function to handle single audio case
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
    const command = `ffmpeg -i ${dialoguePath} -i ${soundEffectPath} -filter_complex "[0:a]volume=2.0[dialogue];[1:a]volume=0.75[sfx];[dialogue][sfx]amix=inputs=2:duration=longest" -c:a libmp3lame ${outputPath}`;
    
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

async function generateDialogue(dialogueData, retryCount = 0) {
  try {
    console.log('Generating dialogue with data:', {
      text: dialogueData.text,
      description: dialogueData.description
    });

    // Use Livepeer API for text-to-speech
    const requestData = {
      model_id: "parler-tts/parler-tts-large-v1",
      text: dialogueData.text,
      description: dialogueData.description
    };

    console.log('Sending TTS request:', requestData);

    const response = await axios.post('https://dream-gateway.livepeer.cloud/text-to-speech', 
      requestData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        },
        responseType: 'json',
        timeout: 30000 // Add a timeout of 30 seconds
      }
    );

    if (response.data && response.data.audio && response.data.audio.url) {
      const audioUrl = response.data.audio.url;
      const audioResponse = await axios.get(audioUrl, { responseType: 'arraybuffer' });
      const audioPath = dialogueData.outputPath || path.resolve(process.cwd(), `dialogue_${Date.now()}.mp3`);
      await fs.promises.writeFile(audioPath, Buffer.from(audioResponse.data));
      console.log(`Dialogue audio saved to ${audioPath}`);
      return audioPath;
    } else {
      console.error('Invalid response structure:', response.data);
      throw new Error('Invalid response from text-to-speech API');
    }
  } catch (error) {
    console.error('Error generating dialogue:');
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    console.error('Error message:', error.message);
    
    // Implement retry logic similar to other functions
    if (retryCount < MAX_RETRIES) {
      console.log(`Retrying dialogue generation in ${RETRY_DELAY / 1000} seconds... (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return generateDialogue(dialogueData, retryCount + 1);
    }
    
    // If all retries fail, return null so the program can continue without dialogue
    console.warn(`All ${MAX_RETRIES} attempts to generate dialogue failed. Proceeding without dialogue.`);
    return null;
  }
}

async function generateSoundEffect(soundEffectDescription, outputPath, retryCount = 0) {
  try {
    console.log(`Generating sound effect: ${soundEffectDescription}`);
    
    const audioBuffer = await client.textToSoundEffects.convert({
      text: soundEffectDescription,
      duration_seconds: 5, // Adjust as needed
      prompt_influence: 0.5
    });
    
    const finalOutputPath = outputPath || `sound_effect_${Date.now()}.mp3`;
    await fs.promises.writeFile(finalOutputPath, audioBuffer);
    console.log(`Sound effect audio saved to ${finalOutputPath}`);
    return finalOutputPath;
  } catch (error) {
    console.error(`Error generating sound effect (attempt ${retryCount + 1}):`, error);
    
    if (retryCount < MAX_RETRIES) {
      console.log(`Retrying in ${RETRY_DELAY / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return generateSoundEffect(soundEffectDescription, outputPath, retryCount + 1);
    }
    
    throw error;
  }
}
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
      const extendedVideoPath = path.resolve(process.cwd(), `extended_video_${i}_${Date.now()}.mp4`);
      await extendVideoDuration(videoPaths[i], extendedVideoPath, audioDuration);
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

function createVideoFromVideos(videoPaths, outputPath, durations) {
  return new Promise((resolve, reject) => {
    const inputFiles = videoPaths.map(path => `-i ${path}`).join(' ');
    const filterComplex = videoPaths.map((_, index) => 
  `[${index}:v]scale=576:1024:force_original_aspect_ratio=decrease,pad=576:1024:(ow-iw)/2:(oh-ih)/2[v${index}];`).join('');
    const filterComplexConcat = videoPaths.map((_, index) => `[v${index}]`).join('') + `concat=n=${videoPaths.length}:v=1:a=0[outv]`;
    
    const command = `ffmpeg -y ${inputFiles} -filter_complex "${filterComplex}${filterComplexConcat}" -map "[outv]" -c:v libx264 -pix_fmt yuv420p ${outputPath}`;
    
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
        console.log('Video file created successfully');
        resolve(outputPath);
      } else {
        console.error('Video file was not created');
        reject(new Error('Video file was not created'));
      }
    });
  });
}

async function generateVideoFromImage(imagePath, duration, retryCount = 0) {
  console.log("Generating video from image...");
  const form = new FormData();
  
  // Read the image file
  const imageStream = fs.createReadStream(imagePath);
  
  form.append('image', imageStream);
  form.append('model_id', 'stabilityai/stable-video-diffusion-img2vid-xt-1-1');
  form.append('width', '576');
  form.append('height', '1024');
  form.append('num_inference_steps', '25');
  form.append('fps', '6');
  
  try {
    const response = await axios.post('https://dream-gateway.livepeer.cloud/image-to-video', form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${API_KEY}`
      }
    });

    console.log('API Response:', JSON.stringify(response.data, null, 2));

    if (response.data && response.data.images && response.data.images[0] && response.data.images[0].url) {
      const videoUrl = response.data.images[0].url;
      console.log(`Video generated successfully: ${videoUrl}`);
      
      // Download the video
      const tempVideoPath = `temp_video_${Date.now()}.mp4`;
      await downloadAIImage(videoUrl, tempVideoPath);
      
      // Adjust the video to the desired duration
      const adjustedVideoPath = `adjusted_video_${Date.now()}.mp4`;
      await adjustVideoDuration(tempVideoPath, adjustedVideoPath, duration);
      
      // Clean up the temporary file
      fs.unlinkSync(tempVideoPath);
      
      return adjustedVideoPath;
    } else {
      throw new Error('Invalid response from image-to-video API');
    }
  } catch (error) {
    console.error(`Error generating video from image (attempt ${retryCount + 1}):`);
    if (error.response) {
      console.error('Error response:', {
        status: error.response.status,
        data: error.response.data
      });
    } else {
      console.error('Error:', error.message);
    }
    
    if (retryCount < MAX_RETRIES) {
      console.log(`Retrying in ${RETRY_DELAY / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return generateVideoFromImage(imagePath, duration, retryCount + 1);
    }
    
    throw error;
  }
}

// Function to call Grok API
async function callGrokAPI(prompt) {
  const options = {
    method: 'POST',
    url: 'https://api.x.ai/v1/chat/completions', // Replace with actual Grok API endpoint
    headers: {
      'Authorization': `Bearer ${process.env.Grok_API_KEY}`,
      'Content-Type': 'application/json'
    },
    data: {
      model: 'grok-3-latest', // Replace with the correct model name
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 5000,
      temperature: 1.7
    }
  };

  const response = await axios(options);
  return response.data.choices[0].message.content;
}

// Updated getFormattedSceneData function with more robust JSON extraction
async function getFormattedSceneData(userInput) {
  const basePrompt = `Generate a short-form, engaging video movie scene (12.0-30.0 seconds) based on the following user input: ${userInput}.
    
IMPORTANT: First, create a brief storyboard using the "But - Therefore" storytelling technique:
1. Start with an interesting premise/setup featuring a main character.
2. Continue with "BUT..." (introduce a complication or twist) or "THEREFORE..." (show the consequence or resolution).
3. Add more "BUT" or "THEREFORE" beats as needed.
  
EACH STORY BEAT MUST CORRESPOND TO EXACTLY ONE SHOT in your final JSON. The number of story beats in your storyboard must match the number of shots in your JSON. Give the main character a vivid, relatable personality (e.g., cocky but insecure, overly dramatic, hilariously clueless) tied to the premise. Each "BUT" or "THEREFORE" beat must escalate with a mix of absurd humor and relatable stakes (e.g., personal embarrassment, petty revenge, quirky chaos). The skit must be highly entertaining—think funny, chaotic, or edge-of-your-seat, with a tone that hooks a short-form video audience (e.g., TikTok, YouTube Shorts). Feel free to get weird, funny, or bold as long as each beat ties to a single, standalone shot.

DO NOT assume the prompts have consistency between each other; each prompt NEEDS to stand alone.

After generating the scene, provide two distinct choices for the user to continue the story.`;
  
  const formattingInstructions = `
  First, provide your storyboard using the "But - Therefore" structure in plain text. IMPORTANT: Each story beat will become exactly ONE shot in your JSON. Make sure the number of beats matches the number of shots.

Then, format your response as a JSON object with two properties:
1. "scenes": an array of shot objects
2. "choices": an array of two strings representing the user choices for continuing the story

Each scene object should have the following properties:
- startTime: number (in seconds)
- duration: number (in seconds, keep this number between 1.0-4.0)
- prompt: string (vivid, standalone snapshot with sensory details, e.g., 'neon lights flicker wildly,' 'coffee mugs melt into goo,' including the character’s name and actions)
- soundEffect: string (amplifies the mood, e.g., 'cartoonish boings,' 'creepy whispers,' 'frantic keyboard clacks')
- dialogue: object with properties:
  - description: string (specific tone and quirks of the speaker, e.g., 'gruff and sarcastic,' 'shrill with panic,' 'smug but shaky')
  - text: string (witty, exaggerated, or slang-filled lines that match the character’s personality and grab attention)

Example Format:  

### Storyboard (But - Therefore Structure):
**Premise**: Mia, a dramatic barista, brags about her latte art skills to her cafe coworkers.  
**BUT...**  
Her espresso machine explodes, splattering foam everywhere.  
**THEREFORE...**  
Mia shrieks that her viral coffee vid is ruined.  
**BUT...**  
A customer cackles that it’s the best show they’ve seen all week.  
**THEREFORE...**  
Mia grabs a mop, plotting petty revenge on the machine.

{
  "scenes": [
    {
      "startTime": 0.0,
      "duration": 3.0,
      "prompt": "Mia, a wild-haired barista, smirks behind the counter, swirling latte art like a pro.",
      "soundEffect": "Steamy hisses and clinking cups",
      "dialogue": {
        "description": "Mia’s loud, over-the-top diva voice",
        "text": "Bow down, peasants—my foam game’s unmatched!"
      }
    },
    {
      "startTime": 3.0,
      "duration": 2.5,
      "prompt": "The espresso machine erupts, spraying sticky foam across Mia’s face and the counter.",
      "soundEffect": "Loud bang and wet splats",
      "dialogue": {
        "description": "Mia, shrill with panic",
        "text": "Nooo—my masterpiece!"
      }
    },
    {
      "startTime": 5.5,
      "duration": 2.0,
      "prompt": "Mia stares at the mess, foam dripping from her hair, phone in hand.",
      "soundEffect": "Distant cafe chatter and a sad trombone",
      "dialogue": {
        "description": "Mia, whiny and extra",
        "text": "My TikTok streak’s toast—why me?!"
      }
    },
    {
      "startTime": 7.5,
      "duration": 2.5,
      "prompt": "A scruffy customer leans over the counter, grinning and filming Mia’s meltdown.",
      "soundEffect": "Snickering and phone camera clicks",
      "dialogue": {
        "description": "Customer, raspy and amused",
        "text": "This beats Netflix—keep flailing, coffee girl!"
      }
    },
    {
      "startTime": 10.0,
      "duration": 3.0,
      "prompt": "Mia snatches a mop, glaring at the machine like it’s her mortal enemy.",
      "soundEffect": "Squelchy mop slaps and a low revenge hum",
      "dialogue": {
        "description": "Mia, muttering with petty spite",
        "text": "You’re done, you steamy gremlin—watch me win."
      }
    }
  ],
  "choices": [
    "Mia sabotages the machine’s plug to reclaim her dignity.",
    "Mia turns the meltdown into a viral skit to spite the customer."
  ]
}
  `;

  const fullPrompt = `${basePrompt}\n\n${formattingInstructions}`;

  try {
    console.log("Calling Grok API...");
    const response = await callGrokAPI(fullPrompt);
    
    console.log('Raw response:', response);
    
    // More robust JSON extraction using a different approach
    let jsonString = '';
    
    // Try to find JSON between curly braces
    const startIndex = response.indexOf('{');
    const endIndex = response.lastIndexOf('}');
    
    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      jsonString = response.slice(startIndex, endIndex + 1);
      
      // Try to parse the extracted JSON string
      try {
        const sceneData = JSON.parse(jsonString);
        
        // Validate the structure of the parsed JSON
        if (!sceneData.scenes || !Array.isArray(sceneData.scenes)) {
          throw new Error("Invalid JSON structure: missing 'scenes' array");
        }
        
        if (!sceneData.choices || !Array.isArray(sceneData.choices)) {
          // If choices are missing, add default choices
          sceneData.choices = [
            "Continue with the current storyline",
            "Take the story in a different direction"
          ];
          console.log("Added default choices since they were missing");
        }
        
        // Additional validation to ensure each scene has required properties
        sceneData.scenes.forEach((scene, index) => {
          if (!scene.startTime) scene.startTime = index * 2.0;
          if (!scene.duration) scene.duration = 2.0;
          if (!scene.prompt) scene.prompt = "A scene with interesting visual elements";
          if (!scene.soundEffect) scene.soundEffect = "Ambient background sounds";
          if (!scene.dialogue) {
            scene.dialogue = {
              description: "None",
              text: ""
            };
          }
        });
        
        return sceneData;
      } catch (parseError) {
        console.error("JSON parsing failed with extracted string:", parseError);
        // Continue to fallback implementation
      }
    }
    
    // Fallback implementation: Try to extract scenes array if full JSON parsing fails
    const scenesMatch = response.match(/\"scenes\"\s*:\s*\[\s*{[^]*?}\s*\]/);
    if (scenesMatch) {
      const scenesJson = scenesMatch[0];
      const reconstructedJson = `{${scenesJson}, "choices": ["Continue the adventure", "Try something different"]}`;
      
      try {
        const sceneData = JSON.parse(reconstructedJson);
        console.log("Reconstructed JSON successfully");
        return sceneData;
      } catch (reconstructError) {
        console.error("Reconstruction failed:", reconstructError);
      }
    }
    
    // Final fallback: Create a minimal valid structure
    console.log("All JSON extraction attempts failed. Creating default scene structure");
    return {
      scenes: [
        {
          startTime: 0.0,
          duration: 2.0,
          prompt: `A creative interpretation of: ${userInput}`,
          soundEffect: "Ambient background sounds",
          dialogue: {
            description: "Narrator",
            text: `Let me tell you about ${userInput}`
          }
        }
      ],
      choices: [
        "Continue with this theme",
        "Try something completely different"
      ]
    };
    
  } catch (error) {
    console.error("Error getting formatted scene data:", error);
    throw error;
  }
}

// Updated callGrokAPI function with more tokens and lower temperature and fallback for missing API key
async function callGrokAPI(prompt) {
  // Check if API key is available
  if (!process.env.GROK_API_KEY) {
    console.warn("Grok API key is missing. Using fallback implementation.");
    return generateFallbackResponse(prompt);
  }

  const options = {
    method: 'POST',
    url: 'https://api.x.ai/v1/chat/completions',
    headers: {
      'Authorization': `Bearer ${process.env.GROK_API_KEY}`,
      'Content-Type': 'application/json'
    },
    data: {
      model: 'grok-3-latest',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 2000,  // Increased from 1000
      temperature: 1.0   // Reduced from 1.7 for more consistent outputs
    }
  };

  try {
    const response = await axios(options);
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error("Error calling Grok API:", error.message);
    if (error.response) {
      console.error("API response error:", error.response.data);
    }
    console.log("Using fallback implementation due to API error.");
    return generateFallbackResponse(prompt);
  }
}

// Fallback function when Grok API is unavailable
function generateFallbackResponse(prompt) {
  console.log("Generating fallback response for prompt:", prompt.substring(0, 100) + "...");
  
  // Extract the user input from the prompt
  const userInputMatch = prompt.match(/based on the following user input: ([^.\n]+)/i);
  const userInput = userInputMatch ? userInputMatch[1].trim() : "entertainment";
  
  // Create a simple fallback scene
  return JSON.stringify({
    "scenes": [
      {
        "startTime": 0.0,
        "duration": 3.0,
        "prompt": `A person excitedly starts to ${userInput} in their living room`,
        "soundEffect": "Upbeat background music",
        "dialogue": {
          "description": "Enthusiastic narrator",
          "text": `Let's see what happens when you try to ${userInput}!`
        }
      },
      {
        "startTime": 3.0,
        "duration": 3.0,
        "prompt": `The person's attempt at ${userInput} causes unexpected chaos`,
        "soundEffect": "Crash and comedic sound effects",
        "dialogue": {
          "description": "Surprised exclamation",
          "text": "Whoa! That didn't go as planned!"
        }
      },
      {
        "startTime": 6.0,
        "duration": 3.0,
        "prompt": "The person laughs at their own mishap and takes a bow",
        "soundEffect": "Applause and cheerful music",
        "dialogue": {
          "description": "Confident declaration",
          "text": "And that's how you make memories!"
        }
      }
    ],
    "choices": [
      "Try something even more adventurous",
      "Take a more careful approach next time"
    ]
  }, null, 2);
}


// This is a duplicate function that has been consolidated with the one above

async function handleCreateMovie(prompt) {
  console.log(`New movie created: Prompt: ${prompt}`);

  try {
    const sceneData = await getFormattedSceneData(prompt);
    const playbackUrl = await generateMovieScene(sceneData);

    console.log('Playback URL:', playbackUrl);

  } catch (error) {
    console.error(`Error processing movie`, error);
  }
}

async function main() {
  try {
    console.log('Starting the movie generation service...');
    handleCreateMovie("entertain");
    // Keep the script running
    process.stdin.resume();
  } catch (error) {
    console.error('Error in main function:', error);
  }
}

// Comment out or remove the runDemo() call
// runDemo();

// Run the main function
main();
