const axios = require('axios');
const fs = require('fs');
const { exec } = require('child_process');
const tus = require('tus-js-client');
const FormData = require('form-data');
const ethers = require('ethers');
const dotenv = require('dotenv');

const { ElevenLabsClient, ElevenLabs } = require("elevenlabs");
const path = require('path');

const { GALADRIEL_RPC_URL, GALADRIEL_CHAIN_ID, STORY_RPC_URL, STORY_CHAIN_ID, GALADRIEL_CONTRACT_ADDRESS, GALADRIEL_CONTRACT_ABI, STORY_CONTRACT_ADDRESS, STORY_CONTRACT_ABI, API_URL, AI_API_URL } = require('./constants');

// Load environment variables
dotenv.config();

const API_KEY = process.env.LIVEPEER_API_KEY;
const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });

// Initialize Ethers providers
const mnemonic = process.env.MNEMONIC;
const galadriel_provider = new ethers.providers.JsonRpcProvider(GALADRIEL_RPC_URL, GALADRIEL_CHAIN_ID);
const galadriel_signer = ethers.Wallet.fromMnemonic(mnemonic).connect(galadriel_provider);
const galadrielContract = new ethers.Contract(GALADRIEL_CONTRACT_ADDRESS, GALADRIEL_CONTRACT_ABI, galadriel_signer);

const story_provider = new ethers.providers.JsonRpcProvider(STORY_RPC_URL, STORY_CHAIN_ID);
const story_signer = ethers.Wallet.fromMnemonic(mnemonic).connect(story_provider);
const storyContract = new ethers.Contract(STORY_CONTRACT_ADDRESS, STORY_CONTRACT_ABI, story_signer);

const MAX_RETRIES = 20;
const RETRY_DELAY = 5000; // 5 seconds

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

async function generateMovieScene(sceneData) {
  console.log('Starting parallel processing of scenes...');

  const generateSceneContent = async (scene, index) => {
    console.log(`Processing scene ${index + 1}/${sceneData.length}...`);

    // Generate image and video
    const aiImageResult = await generateAIImage(scene.prompt);
    const aiImageUrl = aiImageResult.images[0].url;
    const aiImagePath = `ai_generated_image_${index}.png`;
    await downloadAIImage(aiImageUrl, aiImagePath);
    console.log(`Image ${index + 1} downloaded successfully`);
    const videoPath = await generateVideoFromImage(aiImagePath, scene.duration);
    console.log(`Video ${index + 1} generated successfully`);

    // Generate audio (dialogue and sound effect)
    const audioPath = await generateSceneAudio(scene);
    console.log(`Audio ${index + 1} generated successfully`);

    // Clean up the image file
    try {
      await fs.promises.unlink(aiImagePath);
    } catch (error) {
      console.error(`Error deleting image file ${aiImagePath}:`, error);
    }

    return { videoPath, audioPath };
  };

  const sceneResults = await Promise.all(
    sceneData.map((scene, index) => generateSceneContent(scene, index))
  );

  const videoPaths = sceneResults.map(result => result.videoPath);
  const audioPaths = sceneResults.map(result => result.audioPath);

  console.log('Creating final video from generated videos and audios...');
  const finalVideoPath = 'movie_scene.mp4';
  await createVideoWithAudio(videoPaths, audioPaths, finalVideoPath);

  console.log('Uploading video to Livepeer...');
  const playbackUrl = await uploadVideoToLivepeer(finalVideoPath);
  console.log('Movie scene generated and uploaded successfully!');
  console.log('You can view your video at:', playbackUrl);

  // Clean up temporary files
  try {
    for (const path of [...videoPaths, ...audioPaths]) {
      await fs.promises.unlink(path);
    }
    await fs.promises.unlink(finalVideoPath);
    console.log('Temporary files deleted');
  } catch (error) {
    console.error('Error deleting temporary files:', error);
    // Continue execution even if deletion fails
  }

  return playbackUrl;
}

async function generateSceneAudio(sceneData) {
  let dialogueAudioPath = null;
  
  // Only generate dialogue if we have both text and description
  if (sceneData.dialogue && sceneData.dialogue.text && sceneData.dialogue.description) {
    try {
      dialogueAudioPath = await generateDialogue(sceneData.dialogue);
    } catch (error) {
      console.error('Error generating dialogue, continuing without it:', error);
    }
  }
  
  // Always generate sound effect
  const soundEffectAudioPath = await generateSoundEffect(sceneData.soundEffect);
  
  // If we have both audio files, combine them. If not, just use what we have
  const combinedAudioPath = `combined_audio_${Date.now()}.mp3`;
  if (dialogueAudioPath) {
    await combineAudioFiles(dialogueAudioPath, soundEffectAudioPath, combinedAudioPath);
    // Clean up individual audio files
    try {
      await fs.promises.unlink(dialogueAudioPath);
      await fs.promises.unlink(soundEffectAudioPath);
    } catch (error) {
      console.error('Error deleting temporary audio files:', error);
    }
  } else {
    // If no dialogue, just use the sound effect
    await fs.promises.copyFile(soundEffectAudioPath, combinedAudioPath);
    try {
      await fs.promises.unlink(soundEffectAudioPath);
    } catch (error) {
      console.error('Error deleting sound effect file:', error);
    }
  }

  return combinedAudioPath;
}

// Also update the combineAudioFiles function to handle single audio case
async function combineAudioFiles(dialoguePath, soundEffectPath, outputPath) {
  let command;
  
  if (dialoguePath) {
    // If we have both audio files, mix them with adjusted volumes
    command = `ffmpeg -i ${dialoguePath} -i ${soundEffectPath} -filter_complex "[0:a]volume=2.0[dialogue];[1:a]volume=0.75[sfx];[dialogue][sfx]amix=inputs=2:duration=longest" -c:a libmp3lame ${outputPath}`;
  } else {
    // If we only have sound effect, just copy it with reduced volume
    command = `ffmpeg -i ${soundEffectPath} -filter:a "volume=0.75" -c:a libmp3lame ${outputPath}`;
  }
  
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('Error combining audio files:', error);
        reject(error);
      } else {
        console.log('Audio files processed successfully');
        resolve();
      }
    });
  });
}

async function generateDialogue(dialogueData) {
  try {
    console.log('Generating dialogue with data:', {
      text: dialogueData.text,
      description: dialogueData.description
    });

    const requestData = {
      model_id: "parler-tts/parler-tts-large-v1",
      text: dialogueData.text,
      voice_preset: dialogueData.description  // Changed from description to voice_preset
    };

    console.log('Sending TTS request:', requestData);

    const response = await axios.post('https://dream-gateway.livepeer.cloud/text-to-speech', 
      requestData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`  // Using API_KEY instead of process.env
        },
        responseType: 'json'
      }
    );

    if (response.data && response.data.audio && response.data.audio.url) {
      const audioUrl = response.data.audio.url;
      const audioResponse = await axios.get(audioUrl, { responseType: 'arraybuffer' });
      const audioPath = `dialogue_${Date.now()}.wav`;
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
    throw error;
  }
}

async function generateSoundEffect(soundEffectDescription) {
  try {
    const audioBuffer = await client.textToSoundEffects.convert({
      text: soundEffectDescription,
      duration_seconds: 5, // Adjust as needed
      prompt_influence: 0.5
    });
    
    const audioPath = `sound_effect_${Date.now()}.mp3`;
    await fs.promises.writeFile(audioPath, audioBuffer);
    console.log(`Sound effect audio saved to ${audioPath}`);
    return audioPath;
  } catch (error) {
    console.error('Error generating sound effect:', error);
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
    const tempVideoWithAudio = `temp_video_audio_${i}.mp4`;
    tempFiles.push(tempVideoWithAudio);

    // Combine each video with its corresponding audio
    await new Promise((resolve, reject) => {
      const command = `ffmpeg -i ${videoPaths[i]} -i ${audioPaths[i]} -c:v copy -c:a aac -strict experimental ${tempVideoWithAudio}`;
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

    inputFiles.push(`-i ${tempVideoWithAudio}`);
  }

  // Concatenate all temporary video files
  const inputFilesString = inputFiles.join(' ');
  const filterComplex = `concat=n=${videoPaths.length}:v=1:a=1[outv][outa]`;
  
  const finalCommand = `ffmpeg ${inputFilesString} -filter_complex "${filterComplex}" -map "[outv]" -map "[outa]" ${outputPath}`;

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

async function getFormattedSceneData(userInput) {
  const basePrompt = `Generate a short-form, engaging video scene (12.0-30.0 seconds) based on the following user input: ${userInput}. The scene should feature a charismatic, relatable persona, with a strong hook in the first few seconds and vibrant visuals. Focus on fast-paced, original content like entertaining skits, quick tips, or relatable stories, and include trending-style audio and effects. Ensure the tone is authentic and visually stimulating, designed to grab attention instantly and encourage viewer interaction without being cringe, "How do you do fellow kids", or "HAPPENING!!!"/clickbait. Keep dialouge terse and snappy, and avoid using character names in your prompts. DO NOT assume the prompts have consistency between each other, each prompt NEEDS to stand alone but also fit within the conext of the whole script to have story flow. UNDER NO CIRCUMASTANCE SIMPLY COPY THE EXAMPLE OR BE UNCREATIVE`;
  const formattingInstructions = `
    Format your response as a JSON array of scene objects. Each scene object should have the following properties:
    - startTime: number (in seconds)
    - duration: number (in seconds, keep this number between 1.0-4.0)
    - prompt: string (description of the scene including the actor name if you want to show a person) Make sure in each clip to include full and consistent descriptions because using generalities, definite article, and referencing context of other prompts is useless. You are generating an image with your prompt, so focus on what you want the image and shot to be for each prompt, clear and detailed.
    - soundEffect: string (description of the sound effect for the scene)
    - dialogue: object with properties:
      - description: string (description of voice of speaker)
      - text: string (the dialogue text)
    
    Example:
    [
      {
        "startTime": 0,
        "duration": 2.8,
        "prompt": "A young woman sitting at a coffee shop, looking frustrated as she stares at her laptop screen",
        "soundEffect": "Soft café background noise with light chatter and coffee machine sounds",
        "dialogue": {
          "description": "A relatable, slightly exasperated female voice",
          "text": "Why is this code not working? I've been at it for hours!"
        }
      },
      {
        "startTime": 2.8,
        "duration": 4.2,
        "prompt": "Male friend sliding into the seat across from her with a playful smirk, holding a cup of coffee",
        "soundEffect": "Chair scraping and a light thud as the coffee cup is placed on the table",
        "dialogue": {
          "description": "A cheerful, teasing male voice",
          "text": "Maybe you forgot a semicolon again?"
        }
      },
      {
        "startTime": 7.0,
        "duration": 3.5,
        "prompt": "Young woman rolling her eyes but smiling as she takes a sip of her coffee, the camera zooming in on her face",
        "soundEffect": "Light laughter and a sip sound",
        "dialogue": {
          "description": "Female voice, now amused",
          "text": "Okay, okay, you got me. But seriously, help me out here!"
        }
      },
      {
        "startTime": 10.5,
        "duration": 4.1,
        "prompt": "Man leaning over the laptop, typing quickly as young woman watches in awe, the screen now showing a working code snippet",
        "soundEffect": "Keyboard typing sounds and a triumphant 'ding' sound effect",
        "dialogue": {
          "description": "Male voice, confident and slightly smug",
          "text": "There you go. Next time, just call me sooner!"
        }
      }
    ]
  `;

  const fullPrompt = `${basePrompt}\n\n${formattingInstructions}`;

  try {
    console.log("Starting chat with Galadriel contract...");
    const startChatTx = await galadrielContract.startChat(fullPrompt);

    const receipt = await startChatTx.wait();

    const chatCreatedEvent = receipt.events.find(event => event.event === "ChatCreated");
    if (!chatCreatedEvent) {
      throw new Error("ChatCreated event not found in transaction receipt");
    }
    const chatId = chatCreatedEvent.args.chatId;
    console.log("Chat ID:", chatId);

    console.log("Waiting for chat response...");
    const response = await waitForChatResponse(chatId);
    
    console.log('Raw response:', response);
    
    // Extract JSON from the response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error("No valid JSON found in the response");
    }
    
    const jsonString = jsonMatch[0];
    
    let sceneData;
    try {
      sceneData = JSON.parse(jsonString);
    } catch (parseError) {
      console.error("Error parsing JSON response:", parseError);
      console.log("Extracted JSON string:", jsonString);
      throw new Error("Invalid JSON structure in the extracted response");
    }
    return sceneData;
    
  } catch (error) {
    console.error("Error getting formatted scene data:", error);
    throw error;
  }
}




// Helper function to wait for chat response
function waitForChatResponse(chatId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      galadrielContract.removeAllListeners("ChatResponse");
      reject(new Error("Timeout waiting for chat response"));
    }, 60000); // 1 minute timeout

    galadrielContract.on("ChatResponse", async (responseChatId, event) => {
      if (responseChatId.eq(chatId)) {
        clearTimeout(timeout);
        galadrielContract.removeAllListeners("ChatResponse");

        try {
          // Fetch the chat history to get the response
          const messageHistory = await galadrielContract.getMessageHistory(chatId);
          
          // The last message should be the assistant's response
          const lastMessage = messageHistory[messageHistory.length - 1];
          
          if (lastMessage && lastMessage.role === "assistant") {
            resolve(lastMessage.content[0].value);
          } else {
            reject(new Error("Unable to find assistant's response in chat history"));
          }
        } catch (error) {
          reject(new Error(`Error fetching chat history: ${error.message}`));
        }
      }
    });
  });
}

async function handleCreateMovie(movieId, creator, prompt) {
  console.log(`New movie created: ID ${movieId}, Creator: ${creator}, Prompt: ${prompt}`);

  try {
    const sceneData = await getFormattedSceneData(prompt);
    const playbackUrl = await generateMovieScene(sceneData);

    console.log(`Movie scene generated successfully for movie ID ${movieId}`);
    console.log('Playback URL:', playbackUrl);

    // Update the movie link on the Story Protocol contract
    await updateMovieLink(movieId, playbackUrl);

    console.log(`Movie link updated for movie ID ${movieId}`);
  } catch (error) {
    console.error(`Error processing movie ID ${movieId}:`, error);
  }
}

async function updateMovieLink(movieId, link) {
  try {
    const tx = await storyContract.updateMovieLink(movieId, link);
    await tx.wait();
    console.log(`Movie link updated for movie ID ${movieId}`);
  } catch (error) {
    console.error(`Error updating movie link for movie ID ${movieId}:`, error);
    throw error;
  }
}

function listenForCreateMovieEvents() {
  console.log('Listening for MovieCreated events...');
  storyContract.on("MovieCreated", async (movieId, creator, prompt, event) => {
    console.log(`MovieCreated event detected: Movie ID ${movieId}`);
    await handleCreateMovie(movieId, creator, prompt);
  });
}

async function main() {
  try {
    console.log('Starting the movie generation service...');
    listenForCreateMovieEvents();
    console.log('Listening for MovieCreated events. Press Ctrl+C to exit.');

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
