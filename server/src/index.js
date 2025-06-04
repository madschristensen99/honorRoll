// Main application entry point
const grokService = require('./services/grok');
const movieGenerator = require('./services/movieGenerator');

/**
 * Handle movie creation with a given prompt
 * @param {string} prompt - Initial prompt for movie generation
 * @returns {Promise<string>} - Playback URL for the generated movie
 */
async function handleCreateMovie(prompt) {
  console.log(`New movie created: Prompt: ${prompt}`);

  // Generate story data using Grok API
  const storyData = await grokService.generateStoryPrompt(prompt);
  
  // Generate movie scene using the story data
  const playbackUrl = await movieGenerator.generateMovieScene(storyData);
  
  return playbackUrl;
}

/**
 * Main function to start the movie generation service
 */
async function main() {
  try {
    console.log('Starting the movie generation service...');
    
    // For testing, generate a movie with a default prompt
    // In a real application, this would come from user input
    const prompt = process.argv[2] || 'entertain';
    
    const playbackUrl = await handleCreateMovie(prompt);
    console.log('Movie generated successfully!');
    console.log('Playback URL:', playbackUrl);
  } catch (error) {
    console.error('Error processing movie:', error);
  }
}

// Run the main function if this file is executed directly
if (require.main === module) {
  main();
}

module.exports = {
  handleCreateMovie
};
