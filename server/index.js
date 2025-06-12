#!/usr/bin/env node
// Main entry point for the Honor Roll video generation service
// This service listens for blockchain events and generates videos on demand

// Import required modules
const dotenv = require('dotenv');
const { initializeBlockchainListener } = require('./src/services/blockchainListener');

// Load environment variables
dotenv.config();

// Run the application
console.log('Starting Honor Roll Video Generation Service...');
console.log('Listening for video creation events on the Base blockchain...');

// Initialize blockchain listener
initializeBlockchainListener()
  .then(() => {
    console.log('Blockchain listener initialized successfully!');
    console.log('Waiting for VideoCreated events...');
  })
  .catch(error => {
    console.error('Error initializing blockchain listener:', error);
    process.exit(1);
  });

// Handle process termination
process.on('SIGINT', () => {
  console.log('Shutting down Honor Roll Video Generation Service...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down Honor Roll Video Generation Service...');
  process.exit(0);
});
