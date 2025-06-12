import React, { useState, useEffect } from 'react';
import { useTomo } from '@tomo-inc/tomo-web-sdk';
import { useWeb3 } from '../context/Web3Context';
import * as ethers from 'ethers';
import './VideoGeneration.css';

const VideoGeneration = () => {
  const { connected: isAuthenticated, evmAddress: userAddress } = useTomo();
  const { contracts, honorBalance, refreshHonorBalance, initialized, isLoading, error: web3Error } = useWeb3();
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVideo, setGeneratedVideo] = useState(null);
  const [error, setError] = useState(null);
  const [videoFee, setVideoFee] = useState('20'); // Initialize to 20 HONOR tokens
  const [txHash, setTxHash] = useState('');
  
  // Set video creation fee to 20 HONOR tokens
  useEffect(() => {
    // The fee is hardcoded to 20 HONOR tokens as per the contract
    setVideoFee('20');
  }, []);

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
    
    if (isLoading) {
      setError('Please wait while we connect to the blockchain...');
      return;
    }
    
    if (!initialized || !contracts.videoManager || !contracts.honorToken) {
      setError('Smart contracts not initialized. Please check your connection and make sure you are on the Base network.');
      console.error('Contract initialization issue:', { initialized, contracts });
      return;
    }
    
    // Check if user has enough HONOR tokens
    if (parseFloat(honorBalance) < parseFloat(videoFee)) {
      setError(`Insufficient HONOR balance. You need at least ${videoFee} HONOR tokens.`);
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      // First approve the VideoManager contract to spend HONOR tokens
      const honorTokenContract = contracts.honorToken;
      const videoManagerContract = contracts.videoManager;
      const videoManagerAddress = videoManagerContract.address;
      
      console.log('Approving HONOR tokens for VideoManager...');
      const approveTx = await honorTokenContract.approve(
        videoManagerAddress,
        ethers.parseUnits(videoFee, 18)
      );
      
      await approveTx.wait();
      console.log('Approval successful, creating video...');
      
      // Now create the video with the prompt
      const createVideoTx = await videoManagerContract.createVideo(prompt);
      setTxHash(createVideoTx.hash);
      
      // Wait for transaction confirmation
      await createVideoTx.wait();
      console.log('Video creation transaction confirmed!');
      
      // Refresh HONOR balance after spending tokens
      await refreshHonorBalance();
      
      // In a real implementation, we would wait for the operator to upload to Livepeer
      // and set the Livepeer link. For now, we'll simulate a response with placeholder data.
      
      // Get the latest video ID for this user
      const videoCount = await videoManagerContract.getVideoCount();
      const videoId = videoCount.toNumber() - 1;
      
      // Mock response data (in production this would come from the blockchain/backend)
      const videoData = {
        id: videoId.toString(),
        prompt: prompt,
        url: 'https://lvpr.tv/?v=55171riihgrsbqw8', // Placeholder Livepeer URL
        choices: [
          { id: 'choice1', text: 'Option A: Continue the story' },
          { id: 'choice2', text: 'Option B: Take a different path' }
        ],
        creator: userAddress,
        createdAt: new Date().toISOString(),
        txHash: createVideoTx.hash
      };
      
      setGeneratedVideo(videoData);
      setPrompt('');
    } catch (err) {
      console.error('Error generating video:', err);
      setError(`Failed to generate video: ${err.message || 'Please try again.'}`);
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
      ) : isLoading ? (
        <div className="loading-message">
          <p>Loading smart contracts...</p>
        </div>
      ) : web3Error ? (
        <div className="error-message">
          <p>{web3Error}</p>
          <p>Please make sure you are connected to the Base network.</p>
        </div>
      ) : (
        <>
          <div className="prompt-input-container">
            <label htmlFor="prompt">✨ Enter your magical prompt:</label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={handlePromptChange}
              placeholder="Once upon a time in a digital world..."
              rows={4}
              disabled={isGenerating}
            />
            <button 
              className="generate-btn"
              onClick={handleGenerateVideo}
              disabled={isGenerating || !prompt.trim()}
            >
              {isGenerating ? 'Generating...' : `Generate Video (${videoFee} HONOR)`}
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
