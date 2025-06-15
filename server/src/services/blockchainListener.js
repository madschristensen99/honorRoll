// Blockchain event listener service
const ethers = require('ethers');
const dotenv = require('dotenv');
const contractAddresses = require('../../config/contractAddresses');
const VideoManagerABI = require('../../config/abis/VideoManager.json');
const movieGenerator = require('./movieGenerator');
const grokService = require('./grok');

dotenv.config();

// Environment variables
const PROVIDER_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const OPERATOR_MNEMONIC = process.env.OPERATOR_PRIVATE_KEY; // Using the environment variable that contains the mnemonic

// Contract addresses
const VIDEO_MANAGER_ADDRESS = contractAddresses.BASE_MAINNET.VIDEO_MANAGER;

// Track processed video IDs to prevent duplicate processing
const processedVideoIds = new Set();

/**
 * Initialize blockchain listener
 */
async function initializeBlockchainListener() {
  try {
    console.log('Initializing blockchain listener...');
    
    // Create provider and signer from mnemonic
    const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
    const signer = ethers.Wallet.fromPhrase(OPERATOR_MNEMONIC, provider);
    
    // Create contract instance
    const videoManagerContract = new ethers.Contract(
      VIDEO_MANAGER_ADDRESS,
      VideoManagerABI,
      signer
    );
    
    console.log('Connected to VideoManager contract at:', VIDEO_MANAGER_ADDRESS);
    
    // Get the current block number to only listen for new events
    const currentBlock = await provider.getBlockNumber();
    console.log(`Current block number: ${currentBlock}. Will only listen for new events from this block.`);
    
    // Remove any existing listeners to prevent duplicates
    provider.removeAllListeners();
    videoManagerContract.removeAllListeners();
    
    // Create a specific filter for VideoCreated events
    const filter = videoManagerContract.filters.VideoCreated();
    
    // Instead of using the 'on' method which can trigger multiple times for the same event,
    // we'll use a polling approach to check for new events
    let lastProcessedBlock = currentBlock;
    
    // Set up a polling interval to check for new events
    const pollInterval = setInterval(async () => {
      try {
        // Get the current block number
        const latestBlock = await provider.getBlockNumber();
        
        // If no new blocks, skip
        if (latestBlock <= lastProcessedBlock) {
          return;
        }
        
        console.log(`Checking for new events from block ${lastProcessedBlock + 1} to ${latestBlock}`);
        
        // Query for events in the new block range
        const events = await videoManagerContract.queryFilter(filter, lastProcessedBlock + 1, latestBlock);
        
        // Process each event
        for (const event of events) {
          try {
            const { args, blockNumber, transactionHash, logIndex } = event;
            
            if (!args) {
              console.error('Event received but no args property found:', event);
              continue;
            }
            
            // Extract the relevant data from the args
            const videoId = args[0]; // First argument is videoId
            const creator = args[1]; // Second argument is creator
            const isOriginal = args[2]; // Third argument is isOriginal
            const sequenceHead = args[3]; // Fourth argument is sequenceHead
            const prompt = args[4]; // Fifth argument is prompt
            
            // Check if we've already processed this video ID
            if (processedVideoIds.has(videoId.toString())) {
              console.log(`Video ID ${videoId} has already been processed. Ignoring duplicate event.`);
              continue;
            }
            
            // Log the event details
            console.log(`New video creation detected! Video ID: ${videoId} at block ${blockNumber}`);
            console.log(`Transaction Hash: ${transactionHash}, Log Index: ${logIndex}`);
            console.log(`Creator: ${creator}`);
            console.log(`Prompt: ${prompt}`);
            console.log(`Is Original: ${isOriginal}`);
            console.log(`Sequence Head: ${sequenceHead}`);
            
            // Add to processed set immediately to prevent concurrent processing
            processedVideoIds.add(videoId.toString());
            
            try {
              // Process the video creation
              await processVideoCreation(videoId, creator, prompt, videoManagerContract);
              console.log(`Successfully processed video ID ${videoId}`);
            } catch (error) {
              console.error(`Error processing video ID ${videoId}:`, error);
              // If processing fails, we should remove it from the processed set
              // to allow for retry in the future
              processedVideoIds.delete(videoId.toString());
            }
          } catch (eventError) {
            console.error('Error processing event:', eventError);
          }
        }
        
        // Update the last processed block
        lastProcessedBlock = latestBlock;
      } catch (error) {
        console.error('Error polling for events:', error);
      }
    }, 10000); // Poll every 10 seconds
    
    // Handle cleanup when the process exits
    process.on('SIGINT', () => {
      console.log('Shutting down blockchain listener...');
      clearInterval(pollInterval);
      process.exit(0);
    });
    
    console.log('Blockchain listener initialized successfully. Polling for events every 10 seconds...');
    return { provider, signer, videoManagerContract };
  } catch (error) {
    console.error('Error initializing blockchain listener:', error);
    throw error;
  }
}

/**
 * Process a video creation event
 * @param {string} videoId - ID of the video
 * @param {string} creator - Address of the creator
 * @param {string} prompt - User's initial prompt
 * @param {Contract} videoManagerContract - VideoManager contract instance
 */
async function processVideoCreation(videoId, creator, prompt, videoManagerContract) {
  try {
    console.log(`Processing video creation for video ID: ${videoId}`);
    console.log(`Initial prompt from user: "${prompt}"`);
    
    // 1. Call Grok API to generate the script
    console.log('Calling Grok API to generate script...');
    let grokResponse;
    try {
      grokResponse = await grokService.generateStoryPrompt(prompt);
      console.log('Successfully generated script from Grok API');
    } catch (grokError) {
      console.error('Error calling Grok API:', grokError.message);
      throw new Error(`Failed to generate script from Grok: ${grokError.message}`);
    }
    
    // 2. Process scenes from Grok response
    let scenes = [];
    
    if (grokResponse && grokResponse.scenes && Array.isArray(grokResponse.scenes)) {
      console.log(`Grok API returned ${grokResponse.scenes.length} scenes`);
      
      // Process each scene to ensure valid durations
      scenes = grokResponse.scenes.map((scene, index) => {
        // Ensure each scene has a valid prompt
        const scenePrompt = scene.prompt || prompt;
        
        // IMPORTANT: We've discovered that the Veo3 API only accepts "8s" as a valid duration
        // Any other duration results in a 422 Unprocessable Entity error
        // So we'll use 8s for all scenes for Veo3 API compatibility
        const sceneDuration = 8;
        
        console.log(`Scene ${index + 1}: Using fixed duration ${sceneDuration}s for Veo3 compatibility`);
        console.log(`Scene ${index + 1} prompt: "${scenePrompt.substring(0, 100)}..."`);
        
        return {
          prompt: scenePrompt,
          duration: sceneDuration
        };
      });
    } else {
      console.warn('Invalid or missing scenes in Grok response, creating a single scene with the original prompt');
      scenes = [{
        prompt: prompt,
        duration: 8
      }];
    }
    
    // 3. Generate the video using the movie generator service with all scenes
    console.log(`Generating video with ${scenes.length} scenes`);
    const playbackUrl = await movieGenerator.handleCreateMovieFromScenes(scenes);
    console.log(`Video generated successfully! Playback URL: ${playbackUrl}`);
    
    // 4. Set the Livepeer link in the VideoManager contract
    console.log('Setting Livepeer link in VideoManager contract...');
    const tx = await videoManagerContract.setLivepeerLink(videoId, playbackUrl);
    await tx.wait();
    console.log(`Livepeer link set successfully for video ID: ${videoId}`);
    
    // Mark this video ID as processed
    processedVideoIds.add(videoId);
    
    return { videoId, playbackUrl };
  } catch (error) {
    console.error(`Error processing video creation for video ID ${videoId}:`, error);
    throw error;
  }
}

module.exports = {
  initializeBlockchainListener,
  processVideoCreation
};
