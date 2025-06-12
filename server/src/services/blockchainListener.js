// Blockchain event listener service
const ethers = require('ethers');
const dotenv = require('dotenv');
const contractAddresses = require('../../config/contractAddresses');
const VideoManagerABI = require('../../config/abis/VideoManager.json');
const movieGenerator = require('./movieGenerator');
const livepeerService = require('./livepeer');

dotenv.config();

// Environment variables
const PROVIDER_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const OPERATOR_MNEMONIC = process.env.OPERATOR_PRIVATE_KEY; // Using the environment variable that contains the mnemonic

// Contract addresses
const VIDEO_MANAGER_ADDRESS = contractAddresses.BASE_MAINNET.VIDEO_MANAGER;

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
    
    // Listen for VideoCreated events
    videoManagerContract.on('VideoCreated', async (videoId, creator, isOriginal, sequenceHead, prompt, event) => {
      try {
        console.log(`New video creation detected! Video ID: ${videoId}`);
        console.log(`Creator: ${creator}`);
        console.log(`Prompt: ${prompt}`);
        
        // Process the video creation
        await processVideoCreation(videoId, creator, prompt, videoManagerContract);
      } catch (error) {
        console.error('Error processing video creation event:', error);
      }
    });
    
    console.log('Blockchain listener initialized successfully. Waiting for events...');
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
 * @param {string} prompt - Video prompt
 * @param {Contract} videoManagerContract - VideoManager contract instance
 */
async function processVideoCreation(videoId, creator, prompt, videoManagerContract) {
  try {
    console.log(`Processing video creation for video ID: ${videoId}`);
    
    // 1. Generate the video using the movie generator service
    console.log(`Generating video for prompt: "${prompt}"`);
    const playbackUrl = await movieGenerator.handleCreateMovie(prompt);
    console.log(`Video generated successfully! Playback URL: ${playbackUrl}`);
    
    // 2. Set the Livepeer link in the VideoManager contract
    console.log('Setting Livepeer link in VideoManager contract...');
    const tx = await videoManagerContract.setLivepeerLink(videoId, playbackUrl);
    await tx.wait();
    console.log(`Livepeer link set successfully for video ID: ${videoId}`);
    
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
