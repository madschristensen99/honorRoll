// Grok API service for generating story prompts
const axios = require('axios');
const config = require('../config');

/**
 * Generate a story prompt using Grok API
 * @param {string} prompt - Initial prompt for story generation
 * @returns {Promise<object>} - Generated story data
 */
async function generateStoryPrompt(prompt) {
  try {
    console.log('Calling Grok API...');
    
    if (!config.GROK_API_KEY) {
      throw new Error('GROK_API_KEY is not set. Cannot proceed without API key.');
    }
    
    // Create a custom axios instance with SSL verification disabled
    const httpsAgent = new (require('https').Agent)({ 
      rejectUnauthorized: false,
      secureOptions: require('constants').SSL_OP_NO_TLSv1 | require('constants').SSL_OP_NO_TLSv1_1
    });
    
    const response = await axios.post(
      config.GROK_API_URL,
      {
        model: 'grok-2',
        messages: [
          {
            role: 'system',
            content: config.GROK_SYSTEM_PROMPT
          },
          {
            role: 'user',
            content: `${prompt}\n\n${config.GROK_FORMATTING_INSTRUCTIONS}`
          }
        ],
        temperature: 1.2,
        top_p: 0.9,
        max_tokens: 20000  // Increased from 1000 to 4000 to handle larger responses
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.GROK_API_KEY}`
        },
        httpsAgent: httpsAgent
      }
    );
    
    console.log('Raw response:', response.data.choices[0].message.content);
    
    // Extract the JSON part from the response
    const jsonMatch = response.data.choices[0].message.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const jsonData = JSON.parse(jsonMatch[0]);
        return jsonData;
      } catch (parseError) {
        console.error('JSON parsing error:', parseError.message);
        console.error('JSON content that failed to parse:', jsonMatch[0]);
        throw new Error(`Failed to parse JSON from Grok API response: ${parseError.message}`);
      }
    } else {
      throw new Error('Could not extract JSON from Grok API response');
    }
  } catch (error) {
    console.error('Error calling Grok API:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    
    // No fallback - propagate the error
    throw error;
  }
}

// Fallback response has been removed as requested

module.exports = {
  generateStoryPrompt
};
