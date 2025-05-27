
// Other constants
const API_URL = 'https://livepeer.studio/api';
const AI_API_URL = 'https://dream-gateway.livepeer.cloud/text-to-image';

// Import API key from environment variable
const API_KEY = process.env.LIVEPEER_API_KEY;

module.exports = {
    API_URL,
    AI_API_URL,
    API_KEY
};
