import React, { useState, useEffect } from 'react';
import { useTomo } from '@tomo-inc/tomo-web-sdk';
import { useWeb3 } from '../context/Web3Context';
import * as ethers from 'ethers';
import './Voting.css';

const Voting = () => {
  const { connected: isAuthenticated, evmAddress: userAddress } = useTomo();
  const { contracts, honorBalance, refreshHonorBalance } = useWeb3();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [honorAmount, setHonorAmount] = useState(1);
  const [activeVideo, setActiveVideo] = useState(null);
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [txHash, setTxHash] = useState('');

  // Placeholder video URL
  const placeholderVideoUrl = "https://lvpr.tv/?v=55171riihgrsbqw8";
  const placeholderVideoMp4 = "https://vod-cdn.lp-playback.studio/raw/jxf4iblf6wlsyor6526t4tcmtmqa/catalyst-vod-com/hls/55171riihgrsbqw8/1920p0.mp4?tkn=4ba6c6b6778fb";
  
  // Fetch videos and user balance on component mount


  useEffect(() => {
    const fetchData = async () => {
      console.log('Fetch data called, contracts:', contracts);
      
      // If contracts aren't available, use mock data for testing
      if (!contracts.videoManager || !contracts.votingManager) {
        console.log('Missing contracts, using mock data for testing');
        setLoading(false);
        
        // Create a mock video with the provided Livepeer URL
        const mockVideos = [
          {
            id: '0',
            prompt: 'This is a mock video for testing',
            url: 'https://lvpr.tv/?v=55171riihgrsbqw8',
            videoMp4: 'https://vod-cdn.lp-playback.studio/raw/jxf4iblf6wlsyor6526t4tcmtmqa/catalyst-vod-com/hls/55171riihgrsbqw8/1920p0.mp4?tkn=4ba6c6b6778fb',
            thumbnail: 'https://lvpr.tv/?v=55171riihgrsbqw8',
            creator: '0xDFdC570ec0586D5c00735a2277c21Dcc254B3917',
            choices: [
              {
                id: 'choice0_0',
                text: 'Option 1',
                votes: 5,
                staked: '100',
                url: 'https://lvpr.tv/?v=55171riihgrsbqw8'
              },
              {
                id: 'choice0_1',
                text: 'Option 2',
                votes: 3,
                staked: '75',
                url: 'https://lvpr.tv/?v=55171riihgrsbqw8'
              }
            ],
            endTime: new Date(Date.now() + 86400000).toISOString() // 24 hours from now
          }
        ];
        
        setVideos(mockVideos);
        return;
      }
      
      setLoading(true);
      setError(null);
      
      try {
        // Fetch videos from the blockchain
        const videoManagerContract = contracts.videoManager;
        const votingManagerContract = contracts.votingManager;
        
        // Get total video count
        console.log('Attempting to get video count...');
        const videoCount = await videoManagerContract.getVideoCount();
        console.log('Total videos:', videoCount.toString());
        
        // If no videos, set empty array and show message
        if (videoCount.toNumber() === 0) {
          setVideos([]);
          setError('No videos available yet. Create a video first!');
          setLoading(false);
          return;
        }
        
        // Fetch the latest videos (up to 5 for performance)
        const fetchLimit = Math.min(videoCount.toNumber(), 5);
        console.log(`Will fetch ${fetchLimit} videos`);
        const videosData = [];
        
        for (let i = videoCount.toNumber() - 1; i >= Math.max(0, videoCount.toNumber() - fetchLimit); i--) {
          console.log(`Fetching video ${i}...`);
          try {
            // Get video data from VideoManager
            console.log(`Getting video data for video ${i}...`);
            const videoData = await videoManagerContract.videos(i);
            console.log(`Video ${i} data:`, videoData);
            const prompt = videoData.prompt;
            const creator = videoData.creator;
            const livepeerUrl = videoData.livepeerUrl || placeholderVideoUrl;
            console.log(`Video ${i} livepeerUrl:`, livepeerUrl);
            
            // Get voting data from VotingManager
            console.log(`Getting voting data for video ${i}...`);
            const votingData = await votingManagerContract.getVotingDataForVideo(i);
            console.log(`Video ${i} voting data:`, votingData);
            const endTime = new Date(votingData.endTime.toNumber() * 1000).toISOString();
            
            // Get choices for this video
            const choices = [];
            for (let j = 0; j < 2; j++) { // Assuming 2 choices per video
              const choiceData = await votingManagerContract.getChoiceData(i, j);
              choices.push({
                id: `choice${i}_${j}`,
                text: choiceData.description || `Option ${j + 1}`,
                votes: choiceData.voteCount.toNumber(),
                staked: ethers.formatUnits(choiceData.stakedAmount, 18),
                url: livepeerUrl
              });
            }
            
            videosData.push({
              id: i.toString(),
              prompt: prompt,
              url: livepeerUrl,
              videoMp4: livepeerUrl.includes('lvpr.tv') ? 
                `https://vod-cdn.lp-playback.studio/raw/jxf4iblf6wlsyor6526t4tcmtmqa/catalyst-vod-com/hls/55171riihgrsbqw8/1920p0.mp4?tkn=4ba6c6b6778fb` : 
                placeholderVideoMp4,
              thumbnail: livepeerUrl,
              creator: creator,
              choices: choices,
              endTime: endTime
            });
          } catch (err) {
            console.error(`Error fetching video ${i}:`, err);
          }
        }
        
        console.log('Final videos data:', videosData);
        setVideos(videosData);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load videos. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [contracts.videoManager, contracts.votingManager, placeholderVideoUrl, placeholderVideoMp4]);

  // Handle honor amount input change
  const handleHonorAmountChange = (e) => {
    setHonorAmount(e.target.value);
  };

  // Handle choice selection
  const handleChoiceSelect = (videoId, choiceId) => {
    setActiveVideo(videoId);
    setSelectedChoice(choiceId);
    setError(null);
    setSuccessMessage(null);
  };

  // Handle vote submission
  const handleVoteSubmit = async (videoId, choiceIndex) => {
    if (!isAuthenticated) {
      alert('Please connect your wallet first');
      return;
    }
    
    if (!honorAmount || honorAmount <= 0) {
      alert('Please enter a valid amount of HONOR tokens to vote with');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // First approve the VotingManager contract to spend HONOR tokens
      const honorTokenContract = contracts.honorToken;
      const votingManagerContract = contracts.votingManager;
      const votingManagerAddress = votingManagerContract.address;
      
      console.log('Approving HONOR tokens for VotingManager...');
      const approveTx = await honorTokenContract.approve(
        votingManagerAddress,
        ethers.parseUnits(honorAmount.toString(), 18)
      );
      
      await approveTx.wait();
      // Now vote with HONOR tokens
      console.log(`Voting for choice ${choiceIndex} on video ${videoId} with ${honorAmount} HONOR...`);
      const voteTx = await votingManagerContract.vote(
        videoId,
        choiceIndex,
        ethers.parseUnits(honorAmount.toString(), 18)
      );
      
      setTxHash(voteTx.hash);
      await voteTx.wait();
      console.log('Vote transaction confirmed!');
      
      // Refresh HONOR balance after spending tokens
      await refreshHonorBalance();
      
      // Update local state to reflect the vote
      setVideos(prevVideos => 
        prevVideos.map(video => {
          if (video.id === videoId) {
            return {
              ...video,
              choices: video.choices.map(choice => {
                if (choice.id === `choice${videoId}_${choiceIndex}`) {
                  return {
                    ...choice,
                    votes: choice.votes + 1,
                    staked: (parseFloat(choice.staked) + parseFloat(honorAmount)).toString()
                  };
                }
                return choice;
              })
            };
          }
          return video;
        })
      );
      
      // Reset form
      setHonorAmount(1);
      setSuccessMessage(`Successfully voted with ${honorAmount} HONOR tokens!`);
      
      // After 3 seconds, clear the success message
      setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
    } catch (err) {
      console.error('Error voting:', err);
      setError(`Failed to process your vote: ${err.message || 'Please try again.'}`);
    } finally {
      setLoading(false);
    }
  };

  // Format time remaining
  const formatTimeRemaining = (endTimeStr) => {
    const endTime = new Date(endTimeStr);
    const now = new Date();
    const diffMs = endTime - now;
    
    if (diffMs <= 0) return 'Ended';
    
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${diffHrs}h ${diffMins}m remaining`;
  };

  return (
    <div className="voting-container">
      <h2>Vote & Stake</h2>
      
      {!isAuthenticated && (
        <div className="auth-message">
          <p>Connect your wallet to vote on videos</p>
        </div>
      )}
      
      {loading && <div className="loading">Loading videos...</div>}
      {error && <div className="error">{error}</div>}
      {!loading && !error && videos.length === 0 && <div className="no-videos">No videos available yet. Create a video first!</div>}
      
      {videos.length > 0 && (
        <>
          <div className="videos-grid">
            {videos.map(video => (
              <div 
                key={video.id} 
                className={`video-card ${activeVideo === video.id ? 'active' : ''}`}
                onClick={() => setActiveVideo(video.id)}
              >
                <div className="video-thumbnail">
                  <video 
                    className="video-player"
                    src={video.videoMp4}
                    poster={video.thumbnail}
                    controls
                    playsInline
                    preload="metadata"
                    webkit-playsinline="true"
                    aria-label={`Video: ${video.prompt}`}
                    role="video"
                  >
                    Your browser doesn't support the HTML5 video tag, or the video format.
                  </video>
                  <div className="time-remaining">{formatTimeRemaining(video.endTime)}</div>
                </div>
                <div className="video-details">
                  <div className="video-prompt-container">
                    <div className="prompt-bubble">
                      <p className="video-prompt">"{video.prompt}"</p>
                      <div className="prompt-decorations">
                        <span className="prompt-emoji">✨</span>
                        <span className="prompt-emoji">🎭</span>
                        <span className="prompt-emoji">🌈</span>
                      </div>
                    </div>
                  </div>
                  <h3 className="choices-heading">Choose what happens next!</h3>
                  <div className="video-choices">
                    {video.choices.map(choice => (
                      <div 
                        key={choice.id}
                        className={`choice-option ${selectedChoice === choice.id ? 'selected' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleChoiceSelect(video.id, choice.id);
                        }}
                      >
                        <div className="choice-content">
                          <div className="choice-icon">🎬</div>
                          <p>{choice.text}</p>
                        </div>
                        <div className="choice-stats">
                          <span className="votes-count">🗳️ {choice.votes} votes</span>
                          <span className="honors-staked">🎖️ {choice.staked} Honors</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {activeVideo && (
            <div className="voting-panel">
              <h3>Place Your Vote</h3>
              {error && <div className="error-message">{error}</div>}
              {successMessage && <div className="success-message">{successMessage}</div>}
              <div className="vote-honor-section">
                <h4>Vote with HONOR Tokens</h4>
                <div className="honor-input-container">
                  <input
                    type="number"
                    min="1"
                    value={honorAmount}
                    onChange={handleHonorAmountChange}
                    className="honor-input"
                  />
                  <span className="token-label">HONOR</span>
                </div>
              </div>
              <button 
                className="vote-btn"
                onClick={() => handleVoteSubmit(activeVideo, parseInt(selectedChoice.split('_')[1]))}
                disabled={!isAuthenticated || loading || !selectedChoice}
              >
                {loading ? 'Processing...' : 'Vote Now!'}
              </button>
              <p className="voting-info">
                Your stake will be used to support your chosen option. If your choice wins, 
                you'll receive rewards proportional to your stake from the Aave yield. A portion of the rewards 
                will also go to the content creator through Story Protocol.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Voting;
