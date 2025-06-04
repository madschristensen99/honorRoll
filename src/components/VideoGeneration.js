import React, { useState, useEffect } from 'react';
import { useTomo } from '@tomo-inc/tomo-web-sdk';
import './VideoGeneration.css';

const VideoGeneration = () => {
  const { connected: isAuthenticated, evmAddress: userAddress } = useTomo();
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVideo, setGeneratedVideo] = useState(null);
  const [error, setError] = useState(null);

  // Handle prompt input change
  const handlePromptChange = (e) => {
    setPrompt(e.target.value);
  };

  // Generate video based on prompt
  const handleGenerateVideo = async () => {
    if (!isAuthenticated) {
      setError('Please connect your wallet to generate videos');
      return;
    }

    if (!prompt.trim()) {
      setError('Please enter a prompt');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      // In a real implementation, this would call your backend API
      // For now, we'll simulate a video generation response
      console.log('Generating video with prompt:', prompt);
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Mock response data
      const mockVideoData = {
        id: 'video_' + Date.now(),
        prompt: prompt,
        url: 'https://example.com/video.mp4', // This would be a real video URL in production
        choices: [
          { id: 'choice1', text: 'Option A: Continue the story' },
          { id: 'choice2', text: 'Option B: Take a different path' }
        ],
        creator: userAddress,
        createdAt: new Date().toISOString()
      };
      
      setGeneratedVideo(mockVideoData);
      setPrompt('');
    } catch (err) {
      console.error('Error generating video:', err);
      setError('Failed to generate video. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="video-generation">
      <h2>Create AI-Generated Video</h2>
      
      {!isAuthenticated ? (
        <div className="auth-message">
          <p>Connect your wallet to create videos</p>
        </div>
      ) : (
        <>
          <div className="prompt-input-container">
            <label htmlFor="prompt">Enter your prompt:</label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={handlePromptChange}
              placeholder="Describe the video you want to generate..."
              rows={4}
              disabled={isGenerating}
            />
            <button 
              className="generate-btn"
              onClick={handleGenerateVideo}
              disabled={isGenerating || !prompt.trim()}
            >
              {isGenerating ? 'Generating...' : 'Generate Video'}
            </button>
            {error && <div className="error-message">{error}</div>}
          </div>

          {generatedVideo && (
            <div className="generated-video-container">
              <h3>Your Generated Video</h3>
              <div className="video-player">
                {/* In a real implementation, this would be a video player */}
                <div className="video-placeholder">
                  <p>Video Preview</p>
                  <p className="prompt-display">"{generatedVideo.prompt}"</p>
                </div>
              </div>
              <div className="video-choices">
                <h4>Video Choices</h4>
                <div className="choices-container">
                  {generatedVideo.choices.map(choice => (
                    <div key={choice.id} className="choice-item">
                      <p>{choice.text}</p>
                    </div>
                  ))}
                </div>
                <p className="info-text">
                  Your video has been created! Head over to the Voting tab to see how others vote on your choices.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default VideoGeneration;
