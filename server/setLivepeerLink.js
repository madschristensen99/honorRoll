// Script to set the Livepeer link for a video ID
const { ethers } = require('ethers');
const path = require('path');
require('dotenv').config();

// Import contract addresses and ABI
const contractAddresses = require('./config/contractAddresses');
const VideoManagerABI = require('./config/abis/VideoManager.json');

// Environment variables
const PROVIDER_URL = process.env.BASE_RPC_URL;
const OPERATOR_PRIVATE_KEY = process.env.OPERATOR_PRIVATE_KEY;

// Contract address
const VIDEO_MANAGER_ADDRESS = contractAddresses.BASE_MAINNET.VIDEO_MANAGER;

/**
 * Set the Livepeer link for a video ID
 * @param {string} videoId - ID of the video
 * @param {string} livepeerUrl - Livepeer playback URL
 */
async function setLivepeerLink(videoId, livepeerUrl) {
  try {
    console.log(`Setting Livepeer link for video ID: ${videoId}`);
    console.log(`Livepeer URL: ${livepeerUrl}`);
    
    // Create provider and signer
    const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
    
    // Determine if we have a private key or mnemonic
    let signer;
    if (OPERATOR_PRIVATE_KEY.startsWith('0x') && OPERATOR_PRIVATE_KEY.length === 66) {
      // It's a private key
      signer = new ethers.Wallet(OPERATOR_PRIVATE_KEY, provider);
    } else {
      // It's a mnemonic phrase
      signer = ethers.Wallet.fromPhrase(OPERATOR_PRIVATE_KEY, provider);
    }
    
    console.log(`Connected with address: ${signer.address}`);
    
    // Create contract instance
    const videoManagerContract = new ethers.Contract(
      VIDEO_MANAGER_ADDRESS,
      VideoManagerABI,
      signer
    );
    
    console.log('Connected to VideoManager contract at:', VIDEO_MANAGER_ADDRESS);
    
    // Set the Livepeer link
    console.log('Setting Livepeer link on the contract...');
    const tx = await videoManagerContract.setLivepeerLink(videoId, livepeerUrl);
    
    console.log('Transaction sent. Waiting for confirmation...');
    const receipt = await tx.wait();
    
    console.log('Transaction confirmed!');
    console.log('Transaction hash:', receipt.hash);
    console.log('Block number:', receipt.blockNumber);
    console.log('Gas used:', receipt.gasUsed.toString());
    
    console.log(`Successfully set Livepeer link for video ID ${videoId}`);
    return receipt;
  } catch (error) {
    console.error('Error setting Livepeer link:', error);
    throw error;
  }
}

// Parse command line arguments
const videoId = process.argv[2];
const livepeerUrl = process.argv[3];

if (!videoId || !livepeerUrl) {
  console.error('Usage: node setLivepeerLink.js <videoId> <livepeerUrl>');
  process.exit(1);
}

// Run the script
setLivepeerLink(videoId, livepeerUrl)
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
