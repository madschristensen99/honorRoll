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
      console.warn('GROK_API_KEY is not set. Using fallback response.');
      return generateFallbackResponse(prompt);
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
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: 1000
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
      const jsonData = JSON.parse(jsonMatch[0]);
      return jsonData;
    } else {
      throw new Error('Could not extract JSON from Grok API response');
    }
  } catch (error) {
    console.error('Error calling Grok API:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    
    console.warn('Using fallback response due to API error.');
    return generateFallbackResponse(prompt);
  }
}

/**
 * Generate a fallback response when Grok API is unavailable
 * @param {string} prompt - Initial prompt
 * @returns {object} - Fallback story data
 */
function generateFallbackResponse(prompt) {
  console.log('Generating fallback response for prompt:', prompt);
  
  // A simple fallback response with a basic story structure
  return {
    scenes: [
      {
        startTime: 0.0,
        duration: 3.0,
        prompt: "A person walks into a room, looking confused and disoriented.",
        soundEffect: "Footsteps and door creaking",
        dialogue: {
          description: "Narrator, calm and mysterious",
          text: "Sometimes, the most unexpected journeys begin with a single step."
        }
      },
      {
        startTime: 3.0,
        duration: 2.5,
        prompt: "The person discovers a glowing object on a table in the center of the room.",
        soundEffect: "Soft humming and magical twinkling",
        dialogue: {
          description: "Person, surprised and curious",
          text: "What is this strange thing? It seems to be calling to me..."
        }
      },
      {
        startTime: 5.5,
        duration: 2.5,
        prompt: "As they reach for the object, it floats up and begins to spin slowly in the air.",
        soundEffect: "Rising tone and whooshing air",
        dialogue: {
          description: "Person, amazed and slightly afraid",
          text: "It's... it's moving on its own! This can't be happening!"
        }
      }
    ],
    choices: [
      "The person decides to touch the floating object, triggering a magical transformation.",
      "The person backs away cautiously, looking for a way to escape the strange room."
    ]
  };
}

module.exports = {
  generateStoryPrompt
};
