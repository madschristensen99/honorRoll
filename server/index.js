#!/usr/bin/env node
// Main entry point for the movie generation service
// This file serves as a wrapper for the refactored code

// Import the main application module
const movieGenerator = require('./src/index');

// Run the application
console.log('Starting DreamScr Movie Generator...');
movieGenerator.handleCreateMovie(process.argv[2] || 'entertain')
  .then(playbackUrl => {
    console.log('Movie generation complete!');
    console.log('Watch your movie at:', playbackUrl);
  })
  .catch(error => {
    console.error('Error generating movie:', error);
    process.exit(1);
  });
