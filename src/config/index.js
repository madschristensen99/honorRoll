// Configuration settings
require('dotenv').config();

module.exports = {
  // API Keys
  GROK_API_KEY: process.env.GROK_API_KEY,
  FAL_AI_KEY: process.env.FAL_AI_KEY,
  LIVEPEER_API_KEY: process.env.LIVEPEER_API_KEY,
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
  
  // API Endpoints
  GROK_API_URL: 'https://api.x.ai/v1/chat/completions',
  LIVEPEER_API_URL: 'https://dream-gateway.livepeer.cloud/text-to-speech',
  ELEVENLABS_API_URL: 'https://api.elevenlabs.io/v1/sound-generation',
  
  // Retry settings
  MAX_RETRIES: 5,
  RETRY_DELAY: 5000, // 5 seconds
  
  // Video settings
  DEFAULT_FPS: 24,
  MAX_FRAMES: 48,
  
  // Prompt templates
  GROK_SYSTEM_PROMPT: `You are a creative storyteller who creates entertaining short-form video scripts. 
Your task is to create a storyboard with a "But - Therefore" structure, followed by a JSON representation of the scene.

EACH STORY BEAT MUST CORRESPOND TO EXACTLY ONE SHOT in your final JSON. The number of story beats in your storyboard must match the number of shots in your JSON. Give the main character a vivid, relatable personality (e.g., cocky but insecure, overly dramatic, hilariously clueless) tied to the premise. Each "BUT" or "THEREFORE" beat must escalate with a mix of absurd humor and relatable stakes (e.g., personal embarrassment, petty revenge, quirky chaos). The skit must be highly entertaining—think funny, chaotic, or edge-of-your-seat, with a tone that hooks a short-form video audience (e.g., TikTok, YouTube Shorts). Feel free to get weird, funny, or bold as long as each beat ties to a single, standalone shot.

DO NOT assume the prompts have consistency between each other; each prompt NEEDS to stand alone.

After generating the scene, provide two distinct choices for the user to continue the story.`,

  GROK_FORMATTING_INSTRUCTIONS: `
  First, provide your storyboard using the "But - Therefore" structure in plain text. IMPORTANT: Each story beat will become exactly ONE shot in your JSON. Make sure the number of beats matches the number of shots.

Then, format your response as a JSON object with two properties:
1. "scenes": an array of shot objects
2. "choices": an array of two strings representing the user choices for continuing the story

Each scene object should have the following properties:
- startTime: number (in seconds)
- duration: number (in seconds, keep this number between 1.0-4.0)
- prompt: string (vivid, standalone snapshot with sensory details, e.g., 'neon lights flicker wildly,' 'coffee mugs melt into goo,' including the character's name and actions)
- soundEffect: string (amplifies the mood, e.g., 'cartoonish boings,' 'creepy whispers,' 'frantic keyboard clacks')
- dialogue: object with properties:
  - description: string (specific tone and quirks of the speaker, e.g., 'gruff and sarcastic,' 'shrill with panic,' 'smug but shaky')
  - text: string (witty, exaggerated, or slang-filled lines that match the character's personality and grab attention)

Example Format:  

### Storyboard (But - Therefore Structure):
**Premise**: Mia, a dramatic barista, brags about her latte art skills to her cafe coworkers.  
**BUT...**  
Her espresso machine explodes, splattering foam everywhere.  
**THEREFORE...**  
Mia shrieks that her viral coffee vid is ruined.  
**BUT...**  
A customer cackles that it's the best show they've seen all week.  
**THEREFORE...**  
Mia grabs a mop, plotting petty revenge on the machine.

{
  "scenes": [
    {
      "startTime": 0.0,
      "duration": 3.0,
      "prompt": "Mia, a wild-haired barista, smirks behind the counter, swirling latte art like a pro.",
      "soundEffect": "Steamy hisses and clinking cups",
      "dialogue": {
        "description": "Mia's loud, over-the-top diva voice",
        "text": "Bow down, peasants—my foam game's unmatched!"
      }
    },
    {
      "startTime": 3.0,
      "duration": 2.5,
      "prompt": "The espresso machine erupts, spraying coffee foam all over Mia's face and apron.",
      "soundEffect": "Explosive pop and splattering liquid",
      "dialogue": {
        "description": "Mia, sputtering through foam",
        "text": "My FACE! My FOLLOWERS! Nooooo!"
      }
    },
    {
      "startTime": 5.5,
      "duration": 2.5,
      "prompt": "Mia frantically wipes foam from her eyes, phone in hand, whining at her ruined recording.",
      "soundEffect": "Dramatic violin and phone notification dings",
      "dialogue": {
        "description": "Mia, voice cracking with despair",
        "text": "My viral moment—RUINED! I'll never be famous now!"
      }
    },
    {
      "startTime": 8.0,
      "duration": 2.0,
      "prompt": "A customer with thick glasses slaps the counter, laughing so hard they snort coffee through their nose.",
      "soundEffect": "Hysterical cackling and liquid snort",
      "dialogue": {
        "description": "Customer, between gasping laughs",
        "text": "Best coffee show EVER! Do it again!"
      }
    },
    {
      "startTime": 10.0,
      "duration": 3.0,
      "prompt": "Mia grabs a mop, eyes narrowed at the espresso machine, plotting revenge while foam drips from her hair.",
      "soundEffect": "Ominous drum beat and squeaky mop sounds",
      "dialogue": {
        "description": "Mia, whisper-hissing dramatically",
        "text": "Oh, it's ON now, you metal monster!"
      }
    }
  ],
  "choices": [
    "Mia rigs the espresso machine for revenge, but it backfires spectacularly.",
    "Mia's foam-covered meltdown goes viral instead, making her internet famous."
  ]
}`
};
