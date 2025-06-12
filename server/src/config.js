// Configuration for the Honor Roll server
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Configuration object
const config = {
  // API Keys
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
  LIVEPEER_API_KEY: process.env.LIVEPEER_API_KEY,
  GROK_API_KEY: process.env.GROK_API_KEY,
  FAL_AI_KEY: process.env.FAL_AI_KEY,
  
  // Blockchain Configuration
  BASE_RPC_URL: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  OPERATOR_PRIVATE_KEY: process.env.OPERATOR_PRIVATE_KEY,
  
  // API Endpoints
  ELEVENLABS_API_URL: 'https://api.elevenlabs.io/v1/text-to-speech',
  LIVEPEER_API_URL: 'https://livepeer.studio/api/text-to-speech',
  GROK_API_URL: 'https://api.groq.com/openai/v1/chat/completions',
  
  // Retry Configuration
  MAX_RETRIES: 3,
  RETRY_DELAY: 3000, // 3 seconds
  
  // Output Directories
  OUTPUT_DIR: process.env.OUTPUT_DIR || './output',
  
  // Video Configuration
  VIDEO_WIDTH: 1080,
  VIDEO_HEIGHT: 1920,
  VIDEO_FPS: 24,
  VIDEO_DURATION: 10, // seconds
  
  // Audio Configuration
  AUDIO_SAMPLE_RATE: 44100,
  AUDIO_CHANNELS: 2,
  
  // Blockchain Configuration
  BASE_CHAIN_ID: 8453,
  VIDEO_CREATION_COST: 20 // 20 HONOR tokens
};

module.exports = config;
