import React, { useState, useEffect } from 'react';
import { useTomo } from '@tomo-inc/tomo-web-sdk';
import { useWeb3 } from '../context/Web3Context';
import * as ethers from 'ethers';
import './VideoGeneration.css';

const VideoGeneration = () => {
  const { connected: isAuthenticated, providers } = useTomo();
  const { contracts, honorBalance, refreshHonorBalance, initialized, isLoading, error: web3Error } = useWeb3();
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [generatedVideo, setGeneratedVideo] = useState(null);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [videoFee, setVideoFee] = useState('20'); // Initialize to 20 HONOR tokens
  const [txHash, setTxHash] = useState('');
  const [userAddress, setUserAddress] = useState('');
  const [allowance, setAllowance] = useState('0');
  const [isCheckingAllowance, setIsCheckingAllowance] = useState(false);
  
  // Set video creation fee to 20 HONOR tokens
  useEffect(() => {
    // The fee is hardcoded to 20 HONOR tokens as per the contract
    setVideoFee('20');
  }, []);
  
  // Effect to get user address when authenticated
  useEffect(() => {
    const getUserAddress = async () => {
      if (isAuthenticated && providers.ethereumProvider) {
        try {
          const accounts = await providers.ethereumProvider.request({
            method: 'eth_requestAccounts'
          });
          setUserAddress(accounts[0]);
        } catch (error) {
          console.error('Error getting user address:', error);
        }
      }
    };
    
    getUserAddress();
  }, [providers, isAuthenticated]);
  
  // Separate effect to check allowance when dependencies change
  useEffect(() => {
    // Only check allowance when all required dependencies are available
    if (userAddress && initialized && isAuthenticated && contracts.videoManager && contracts.honorToken) {
      console.log('Dependencies ready, checking allowance...');
      checkAllowance();
    }
  }, [userAddress, initialized, isAuthenticated, contracts.videoManager, contracts.honorToken]);
  
  // Check HONOR token allowance for VideoManager contract
  const checkAllowance = async () => {
    if (!isAuthenticated || !userAddress || !initialized || !contracts.videoManager || !contracts.honorToken) {
      return;
    }
    
    setIsCheckingAllowance(true);
    
    try {
      console.log('Checking HONOR token allowance for VideoManager...');
      
      const honorTokenAddress = contracts.honorToken?.target;
      const videoManagerAddress = contracts.videoManager?.target;
      
      if (!honorTokenAddress || !videoManagerAddress) {
        console.error('Contract addresses not available');
        return;
      }
      
      // Try to get the allowance using the contract's allowance method
      try {
        const allowanceValue = await contracts.honorToken.allowance(userAddress, videoManagerAddress);
        const formattedAllowance = ethers.formatUnits(allowanceValue, 6); // HONOR token has 6 decimals
        
        console.log('Current HONOR token allowance:', formattedAllowance);
        setAllowance(formattedAllowance);
      } catch (contractError) {
        console.error('Error calling allowance method directly:', contractError);
        
        // Fallback: Try using eth_call directly
        try {
          // Encode the allowance function call
          const honorTokenInterface = new ethers.Interface([
            'function allowance(address owner, address spender) view returns (uint256)'
          ]);
          
          const data = honorTokenInterface.encodeFunctionData('allowance', [userAddress, videoManagerAddress]);
          
          // Make the eth_call
          const result = await providers.ethereumProvider.request({
            method: 'eth_call',
            params: [{
              to: honorTokenAddress,
              data: data
            }, 'latest']
          });
          
          // Decode the result
          const decodedResult = honorTokenInterface.decodeFunctionResult('allowance', result);
          const formattedAllowance = ethers.formatUnits(decodedResult[0], 6);
          
          console.log('Current HONOR token allowance (from eth_call):', formattedAllowance);
          setAllowance(formattedAllowance);
        } catch (fallbackError) {
          console.error('Error in fallback allowance check:', fallbackError);
          setAllowance('0');
        }
      }
    } catch (error) {
      console.error('Error checking allowance:', error);
      setAllowance('0');
    } finally {
      setIsCheckingAllowance(false);
    }
  };
  
  // Refresh HONOR balance and check allowance on component mount and when address changes
  useEffect(() => {
    if (isAuthenticated && userAddress && initialized && contracts.videoManager && contracts.honorToken) {
      console.log('VideoGeneration: Refreshing HONOR balance and checking allowance');
      refreshHonorBalance();
      checkAllowance();
    }
  }, [isAuthenticated, userAddress, initialized, contracts.videoManager, contracts.honorToken, refreshHonorBalance]);

  // Handle prompt input change
  const handlePromptChange = (e) => {
    setPrompt(e.target.value);
  };
  
  // Handle HONOR token approval
  const handleApproveHonor = async () => {
    if (!isAuthenticated || !userAddress || !initialized || !contracts.videoManager || !contracts.honorToken) {
      setError('Please connect your wallet and try again.');
      return;
    }
    
    setIsApproving(true);
    setError(null);
    setSuccessMessage('');
    
    try {
      console.log('Approving HONOR tokens for VideoManager contract...');
      
      // Get the VideoManager contract address
      const videoManagerAddress = contracts.videoManager?.target;
      if (!videoManagerAddress) {
        throw new Error('VideoManager contract address not available');
      }
      
      // Calculate the approval amount (using a large number to avoid frequent approvals)
      const approvalAmount = ethers.parseUnits('1000000', 6); // 1,000,000 HONOR tokens with 6 decimals
      
      // Get the HonorToken contract interface for encoding the function call
      const honorTokenInterface = new ethers.Interface([
        'function approve(address spender, uint256 amount) returns (bool)'
      ]);
      
      // Encode the approve function call
      const data = honorTokenInterface.encodeFunctionData('approve', [videoManagerAddress, approvalAmount]);
      
      // Get the HonorToken contract address
      const honorTokenAddress = contracts.honorToken?.target;
      if (!honorTokenAddress) {
        throw new Error('HonorToken contract address not available');
      }
      
      // Prepare transaction parameters
      const transactionParameters = {
        to: honorTokenAddress,
        from: userAddress,
        data: data,
        gas: '0x186A0', // 100,000 gas limit
      };
      
      console.log('Sending approval transaction with parameters:', transactionParameters);
      
      // Send the transaction using the Tomo SDK provider
      const txHash = await providers.ethereumProvider.sendTransaction(transactionParameters);
      
      console.log('Approval transaction sent:', txHash);
      setSuccessMessage('HONOR tokens approved successfully!');
      
      // Refresh allowance after approval
      await checkAllowance();
      
      return txHash;
    } catch (error) {
      console.error('Error approving HONOR tokens:', error);
      setError(`Error approving HONOR tokens: ${error.message || error}`);
      return null;
    } finally {
      setIsApproving(false);
    }
  };

  // Effect to retry contract initialization if needed
  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 3;
    
    const checkContracts = () => {
      if (!initialized || !contracts.videoManager || !contracts.honorToken) {
        if (retryCount < maxRetries) {
          console.log(`VideoGeneration: Contracts not initialized, retrying (${retryCount + 1}/${maxRetries})...`);
          retryCount++;
          // Try again in 2 seconds
          setTimeout(checkContracts, 2000);
        } else {
          console.error('VideoGeneration: Failed to initialize contracts after retries');
        }
      } else {
        console.log('VideoGeneration: Contracts initialized successfully');
        setError(null); // Clear any previous errors
      }
    };
    
    // Only start checking if we're authenticated
    if (isAuthenticated) {
      checkContracts();
    }
  }, [isAuthenticated, initialized, contracts]);
  
  // Handle video generation
  const handleGenerateVideo = async () => {
    if (!isAuthenticated) {
      setError('Please connect your wallet to generate a video.');
      return;
    }

    if (!prompt) {
      setError('Please enter a prompt.');
      return;
    }

    if (!initialized || !contracts.honorToken || !contracts.videoManager) {
      setError('Contracts not initialized. Please try again.');
      return;
    }
    
    // Check if the user has approved enough HONOR tokens
    // Compare as numbers instead of using BigNumber methods
    if (parseFloat(allowance) < parseFloat(videoFee)) {
      setError(`Please approve at least ${videoFee} HONOR tokens before generating a video.`);
      return;
    }

    setIsGenerating(true);
    setError(null);
    setSuccessMessage('');
    setGeneratedVideo(null);

    try {
      console.log('Generating video with prompt:', prompt);
      console.log('User address:', userAddress);

      // Check HONOR token balance before proceeding
      const balance = await contracts.honorToken.balanceOf(userAddress);
      const formattedBalance = ethers.formatUnits(balance, 6); // Assuming 6 decimals for HONOR token
      console.log('HONOR balance:', formattedBalance);

      if (parseFloat(formattedBalance) < parseFloat(videoFee)) {
        setError(`Insufficient HONOR tokens. You need ${videoFee} HONOR tokens to generate a video.`);
        setIsGenerating(false);
        return;
      }

      // Get the VideoManager contract interface for encoding the function call
      const videoManagerInterface = new ethers.Interface([
        'function createOriginalVideo(string prompt) returns (uint256)'
      ]);
      
      // Encode the createOriginalVideo function call
      const data = videoManagerInterface.encodeFunctionData('createOriginalVideo', [prompt]);
      
      // Get the VideoManager contract address
      const videoManagerAddress = contracts.videoManager?.target;
      if (!videoManagerAddress) {
        throw new Error('VideoManager contract address not available');
      }
      
      // Prepare transaction parameters
      const transactionParameters = {
        to: videoManagerAddress,
        from: userAddress,
        data: data,
        gas: '0x186A0', // 100,000 gas limit
      };
      
      console.log('Sending video generation transaction with parameters:', transactionParameters);
      
      // Send the transaction using the Tomo SDK provider
      const txHash = await providers.ethereumProvider.sendTransaction(transactionParameters);
      
      console.log('Video generation transaction sent:', txHash);
      setTxHash(txHash);
      setSuccessMessage('Video generation transaction submitted successfully!');

      // Refresh HONOR balance and allowance after transaction
      refreshHonorBalance();
      checkAllowance();

      // For demo purposes, simulate a generated video
      const videoData = {
        url: 'https://example.com/video.mp4',
        prompt: prompt,
        timestamp: new Date().toISOString(),
        choices: [
          { id: 'choice1', text: 'Option A: Continue the story' },
          { id: 'choice2', text: 'Option B: Take a different path' }
        ],
        creator: userAddress,
        createdAt: new Date().toISOString(),
        txHash: txHash
      };
      
      setGeneratedVideo(videoData);
      setPrompt('');

      console.log('Video generated successfully');
    } catch (err) {
      console.error('Error generating video:', err);
      setError(`Error generating video: ${err.message || err}`);
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
            <div className="button-container">
              <button 
                className="approve-btn"
                onClick={handleApproveHonor}
                disabled={isApproving || isGenerating}
              >
                {isApproving ? 'Approving...' : 'Approve HONOR'}
              </button>
              <button 
                className="generate-btn"
                onClick={handleGenerateVideo}
                disabled={isGenerating || !prompt.trim() || parseFloat(allowance) < parseFloat(videoFee)}
              >
                {isGenerating ? 'Generating...' : `Generate Video (${videoFee} HONOR)`}
              </button>
            </div>
            
            <div className="status-container">
              {isCheckingAllowance ? (
                <div className="allowance-info loading">Checking allowance...</div>
              ) : (
                <div className="allowance-info">
                  <span className="allowance-label">Current allowance:</span>
                  <span className="allowance-value">{parseFloat(allowance).toFixed(2)} HONOR</span>
                  {parseFloat(allowance) >= parseFloat(videoFee) ? (
                    <span className="allowance-status sufficient">✓ Sufficient</span>
                  ) : (
                    <span className="allowance-status insufficient">⚠️ Insufficient</span>
                  )}
                </div>
              )}
              {successMessage && <div className="success-message">{successMessage}</div>}
              {error && <div className="error-message">{error}</div>}
            </div>
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
