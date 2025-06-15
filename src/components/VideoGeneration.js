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
      console.log('Checking allowance for user:', userAddress);
      console.log('VideoManager address:', contracts.videoManager.target);
      
      // Use the provider's eth_call directly instead of contract method
      try {
        // Get the ABI for the allowance function
        const allowanceInterface = new ethers.Interface([
          'function allowance(address owner, address spender) view returns (uint256)'
        ]);
        
        // Encode the function call
        const data = allowanceInterface.encodeFunctionData('allowance', [
          userAddress,
          contracts.videoManager.target
        ]);
        
        console.log('Allowance check data:', data);
        console.log('Honor token address:', contracts.honorToken.target);
        
        // Make the eth_call
        const result = await providers.ethereumProvider.request({
          method: 'eth_call',
          params: [{
            to: contracts.honorToken.target,
            data: data
          }, 'latest']
        });
        
        // Decode the result
        const decodedResult = allowanceInterface.decodeFunctionResult('allowance', result)[0];
        const formattedAllowance = ethers.formatUnits(decodedResult, 6); // Assuming 6 decimals for HONOR token
        console.log('Allowance from eth_call:', formattedAllowance);
        setAllowance(formattedAllowance);
      } catch (ethCallError) {
        console.error('Error checking allowance with eth_call:', ethCallError);
        // Keep the previous allowance value instead of resetting to zero
        console.log('Keeping previous allowance value:', allowance);
      }
    } catch (error) {
      console.error('Error checking allowance:', error);
      // Keep the previous allowance value instead of resetting to zero
      console.log('Keeping previous allowance value:', allowance);
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
  
  // Check if we're on the Base network
  const checkNetwork = async () => {
    try {
      if (!providers?.ethereumProvider) {
        throw new Error('Ethereum provider not available');
      }
      
      // Check current chain ID
      const chainIdValue = await providers.ethereumProvider.request({
        method: 'eth_chainId'
      });
      
      const currentChainId = typeof chainIdValue === 'string' && chainIdValue.startsWith('0x') 
        ? parseInt(chainIdValue, 16) 
        : Number(chainIdValue);
      
      console.log('Current chain ID:', currentChainId);
      
      // Base Mainnet chain ID
      const BASE_CHAIN_ID = 8453;
      
      if (currentChainId !== BASE_CHAIN_ID) {
        setError(`Please switch to Base network manually. Current network ID: ${currentChainId}, expected: ${BASE_CHAIN_ID}`);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Error checking network:', error);
      setError(`Error checking network: ${error.message}`);
      return false;
    }
  };
  
  // Handle HONOR token approval
  const handleApproveHonor = async () => {
    if (!isAuthenticated || !userAddress || !initialized || !contracts.videoManager || !contracts.honorToken) {
      setError('Please connect your wallet and try again.');
      return;
    }
    
    // Check if we're on the Base network
    const isCorrectNetwork = await checkNetwork();
    if (!isCorrectNetwork) {
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
      
      // Calculate the approval amount (just enough for one video creation)
      const approvalAmount = ethers.parseUnits('20', 6); // 20 HONOR tokens with 6 decimals
      
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
        value: '0x0',
        gas: '0x30000' // Using gas instead of gasLimit for better compatibility
      };
      
      console.log('Sending approval transaction with parameters:', transactionParameters);
      
      // Use the request method with eth_sendTransaction instead of sendTransaction directly
      // This is more compatible with different wallet providers
      console.log('Using eth_sendTransaction for better wallet compatibility');
      const txHash = await providers.ethereumProvider.request({
        method: 'eth_sendTransaction',
        params: [transactionParameters]
      });
      
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
    
    // Check if we're on the Base network
    const isCorrectNetwork = await checkNetwork();
    if (!isCorrectNetwork) {
      return;
    }

    setIsGenerating(true);
    setError(null);
    setSuccessMessage('');
    setGeneratedVideo(null);

    try {
      console.log('Generating video with prompt:', prompt);
      console.log('User address:', userAddress);

      // Get the VideoManager contract address from addresses.js
      const videoManagerAddress = '0xDF8626Ffb23C8a92A7b906345E7aE756BABD02F4';
      console.log('VideoManager address:', videoManagerAddress);
      
      // HYBRID APPROACH: Try multiple methods to ensure compatibility with all wallets
      console.log('Using hybrid approach for maximum wallet compatibility');
      
      // Create the transaction data using ethers.js Interface
      const videoManagerInterface = new ethers.Interface([
        'function createOriginalVideo(string prompt) payable returns (uint256)'
      ]);
      
      const data = videoManagerInterface.encodeFunctionData('createOriginalVideo', [prompt]);
      console.log('Transaction data:', data);
      
      // Convert 0.001 ETH to wei (hexadecimal)
      const valueInWei = ethers.parseEther('0.001');
      const valueHex = '0x' + valueInWei.toString(16);
      
      // METHOD 1: Try using the contract from Web3Context if available
      if (contracts?.videoManager) {
        try {
          console.log('ATTEMPT 1: Using contract from Web3Context');
          
          const overrides = {
            value: valueInWei,
            gasLimit: 5000000 // 5 million gas
          };
          
          console.log('Transaction overrides:', overrides);
          
          const tx = await contracts.videoManager.createOriginalVideo(prompt, overrides);
          console.log('Transaction submitted via Web3Context:', tx.hash);
          
          // Store the transaction hash
          setTxHash(tx.hash);
          setSuccessMessage('Video generation transaction submitted successfully!');
          
          // Wait for transaction confirmation
          console.log('Waiting for transaction confirmation...');
          const receipt = await tx.wait(1); // Wait for 1 confirmation
          console.log('Transaction confirmed:', receipt);
          
          setSuccessMessage('Video generation transaction confirmed! Video ID will be available soon.');
          return; // Exit if successful
        } catch (contractError) {
          console.error('Error using Web3Context contract:', contractError);
          console.log('Falling back to alternative methods...');
          // Continue to next method
        }
      }
      
      // METHOD 2: Try using eth_sendTransaction directly
      if (providers?.ethereumProvider) {
        try {
          console.log('ATTEMPT 2: Using eth_sendTransaction directly');
          
          // Get current gas price from the network
          const feeData = await providers.ethereumProvider.request({
            method: 'eth_gasPrice',
            params: []
          });
          
          console.log('Current gas price:', feeData);
          
          // Convert gas price to number and add 100% to ensure it's not underpriced
          const gasPrice = parseInt(feeData, 16);
          const adjustedGasPrice = '0x' + Math.floor(gasPrice * 3).toString(16); // Triple the gas price
          
          console.log('Adjusted gas price (3x):', adjustedGasPrice);
          
          // Create the transaction parameters
          const txParams = {
            from: userAddress,
            to: videoManagerAddress,
            data: data,
            value: valueHex,
            gasLimit: '0x4C4B40', // 5 million gas in hex
            gasPrice: adjustedGasPrice
          };
          
          console.log('Transaction parameters:', JSON.stringify(txParams, null, 2));
          
          // Send the transaction using the request method
          const txResult = await providers.ethereumProvider.request({
            method: 'eth_sendTransaction',
            params: [txParams]
          });
          
          console.log('Transaction submitted via eth_sendTransaction:', txResult);
          
          // Store the transaction hash
          setTxHash(txResult);
          setSuccessMessage('Video generation transaction submitted successfully!');
          return; // Exit if successful
        } catch (providerError) {
          console.error('Error using eth_sendTransaction:', providerError);
          console.log('Falling back to final method...');
          // Continue to next method
        }
      }
      
      // METHOD 3: Last resort - try creating a BrowserProvider and signer
      if (providers?.ethereumProvider) {
        try {
          console.log('ATTEMPT 3: Using ethers BrowserProvider');
          
          // Create an ethers.js BrowserProvider from the Tomo provider
          const browserProvider = new ethers.BrowserProvider(providers.ethereumProvider);
          
          // Get the signer from the provider
          console.log('Getting signer from provider...');
          const signer = await browserProvider.getSigner();
          console.log('Got signer with address:', await signer.getAddress());
          
          // Create a contract instance with the signer
          console.log('Creating contract instance...');
          const videoManagerContract = new ethers.Contract(
            videoManagerAddress,
            ['function createOriginalVideo(string prompt) payable returns (uint256)'],
            signer
          );
          
          // Call the contract function directly with value
          console.log('Calling contract function directly...');
          const tx = await videoManagerContract.createOriginalVideo(
            prompt,
            {
              value: valueInWei,
              gasLimit: 5000000 // 5 million gas
            }
          );
          
          console.log('Transaction submitted via BrowserProvider:', tx.hash);
          
          // Store the transaction hash
          setTxHash(tx.hash);
          setSuccessMessage('Video generation transaction submitted successfully!');
          
          // Wait for transaction confirmation
          console.log('Waiting for transaction confirmation...');
          const receipt = await tx.wait(1); // Wait for 1 confirmation
          console.log('Transaction confirmed:', receipt);
          
          setSuccessMessage('Video generation transaction confirmed! Video ID will be available soon.');
          return; // Exit if successful
        } catch (browserProviderError) {
          console.error('Error using BrowserProvider:', browserProviderError);
          throw new Error('All transaction methods failed. Please try again later.');
        }
      }
      
      // If we get here, all methods failed
      throw new Error('Could not find a compatible method to send the transaction');
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
