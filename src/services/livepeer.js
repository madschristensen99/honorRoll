// Livepeer API service for audio generation and video hosting
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { createReadStream } = require('fs');
const config = require('../config');

// Initialize Livepeer API key
const API_KEY = config.LIVEPEER_API_KEY;

/**
 * Generate dialogue audio using Livepeer's text-to-speech API
 * @param {object} dialogueData - Dialogue data with text and description
 * @param {number} retryCount - Current retry count
 * @returns {Promise<string>} - Path to the generated audio file
 */
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

    const response = await axios.post(config.LIVEPEER_API_URL, 
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
      throw new Error('Invalid response from Livepeer TTS API');
    }
  } catch (error) {
    console.error(`Error generating dialogue (attempt ${retryCount + 1}):`, error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    
    if (retryCount < config.MAX_RETRIES) {
      console.log(`Retrying in ${config.RETRY_DELAY / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, config.RETRY_DELAY));
      return generateDialogue(dialogueData, retryCount + 1);
    }
    
    throw error;
  }
}

/**
 * Generate sound effect audio using ElevenLabs sound effects API
 * @param {string} soundEffectText - Description of the sound effect
 * @param {string} outputPath - Path to save the generated audio
 * @param {number} retryCount - Current retry count
 * @returns {Promise<string>} - Path to the generated audio file
 */
async function generateSoundEffect(soundEffectText, outputPath, retryCount = 0) {
  try {
    console.log(`Generating sound effect: ${soundEffectText}`);
    
    // Check if ElevenLabs API key is available
    if (!config.ELEVENLABS_API_KEY) {
      console.warn('ELEVENLABS_API_KEY is not set. Using fallback method for sound effects.');
      return generateFallbackSoundEffect(soundEffectText, outputPath);
    }
    
    // Use ElevenLabs sound effects API
    const requestData = {
      text: soundEffectText,
      model_id: "sound-effects-v1",
      output_format: "mp3"
    };

    console.log('Sending ElevenLabs sound effect request:', requestData);

    const response = await axios.post(config.ELEVENLABS_API_URL, 
      requestData,
      {
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': config.ELEVENLABS_API_KEY
        },
        responseType: 'arraybuffer',
        timeout: 30000 // Add a timeout of 30 seconds
      }
    );

    // Save the audio data directly
    await fs.promises.writeFile(outputPath, Buffer.from(response.data));
    console.log(`Sound effect audio saved to ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error(`Error generating sound effect (attempt ${retryCount + 1}):`, error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    
    // Try the fallback method if ElevenLabs fails
    if (retryCount === 0) {
      console.log('Trying fallback method for sound effects...');
      return generateFallbackSoundEffect(soundEffectText, outputPath);
    }
    
    // If we've failed multiple times, create a silent audio file as fallback
    if (retryCount >= config.MAX_RETRIES) {
      console.log('Creating silent audio file as fallback for sound effect');
      // Use the path module to ensure the outputPath is absolute
      const absolutePath = path.isAbsolute(outputPath) ? outputPath : path.resolve(process.cwd(), outputPath);
      // Create a silent audio file using ffmpeg
      const command = `ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 2 -q:a 9 -acodec libmp3lame "${absolutePath}"`;
      await new Promise((resolve, reject) => {
        require('child_process').exec(command, (error) => {
          if (error) {
            console.error('Error creating silent audio:', error);
            reject(error);
          } else {
            console.log(`Created silent audio file at ${absolutePath}`);
            resolve();
          }
        });
      });
      return absolutePath;
    }
    
    console.log(`Retrying in ${config.RETRY_DELAY / 1000} seconds...`);
    await new Promise(resolve => setTimeout(resolve, config.RETRY_DELAY));
    return generateSoundEffect(soundEffectText, outputPath, retryCount + 1);
  }
}

/**
 * Generate fallback sound effect using Livepeer TTS API
 * @param {string} soundEffectText - Description of the sound effect
 * @param {string} outputPath - Path to save the generated audio
 * @returns {Promise<string>} - Path to the generated audio file
 */
async function generateFallbackSoundEffect(soundEffectText, outputPath) {
  try {
    console.log(`Generating fallback sound effect for: ${soundEffectText}`);
    
    // Use Livepeer TTS API with special description for sound-like effect
    const requestData = {
      model_id: "parler-tts/parler-tts-large-v1",
      text: soundEffectText,
      description: "Sound effect, ambient and atmospheric"
    };

    console.log('Sending fallback sound effect TTS request:', requestData);

    const response = await axios.post(config.LIVEPEER_API_URL, 
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
      await fs.promises.writeFile(outputPath, Buffer.from(audioResponse.data));
      console.log(`Fallback sound effect audio saved to ${outputPath}`);
      return outputPath;
    } else {
      throw new Error('Invalid response from Livepeer TTS API for fallback sound effect');
    }
  } catch (error) {
    console.error('Error generating fallback sound effect:', error.message);
    throw error;
  }
}

/**
 * Upload a video to Livepeer for hosting
 * @param {string} videoPath - Path to the video file
 * @returns {Promise<string>} - Playback URL for the uploaded video
 */
async function uploadVideoToLivepeer(videoPath) {
  return new Promise(async (resolve, reject) => {
    try {
      if (!fs.existsSync(videoPath)) {
        throw new Error(`Video file not found at ${videoPath}`);
      }
      
      console.log(`Uploading video from ${videoPath} to Livepeer...`);
      
      // Create a form with the video file
      const form = new FormData();
      form.append('file', createReadStream(videoPath));
      
      // Request an upload URL from Livepeer
      const requestUploadResponse = await axios.post(
        'https://livepeer.studio/api/asset/request-upload',
        {
          name: `Movie_${Date.now()}`,
          staticMp4: true,
          playbackPolicy: {
            type: 'public'
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (!requestUploadResponse.data || !requestUploadResponse.data.url) {
        throw new Error('Failed to get upload URL from Livepeer');
      }
      
      // Upload the video to the provided URL
      const upload = axios.create();
      upload.put(
        requestUploadResponse.data.url,
        createReadStream(videoPath),
        {
          headers: {
            'Content-Type': 'video/mp4'
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        }
      ).then(async (uploadResponse) => {
        console.log('Video uploaded successfully to Livepeer');
        
        // Wait for the asset to be ready
        console.log('Waiting for asset to be ready...');
        
        // Generate playback URL
        if (requestUploadResponse.data.asset && requestUploadResponse.data.asset.playbackId) {
          const playbackId = requestUploadResponse.data.asset.playbackId;
          const playbackUrl = `https://lvpr.tv/?v=${playbackId}`;
          console.log('Playback URL:', playbackUrl);
          resolve(playbackUrl);
        }
      }).catch((error) => {
        console.error('Error uploading video to Livepeer:', error);
        reject(error);
      });
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

module.exports = {
  generateDialogue,
  generateSoundEffect,
  uploadVideoToLivepeer
};
