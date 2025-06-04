import React, { useState, useEffect } from 'react';
import { useTomo } from '@tomo-inc/tomo-web-sdk';
import './Voting.css';

const Voting = () => {
  const { connected: isAuthenticated, evmAddress: userAddress } = useTomo();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userBalance, setUserBalance] = useState(0);
  const [stakeAmount, setStakeAmount] = useState('');
  const [activeVideo, setActiveVideo] = useState(null);
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Placeholder video URL
  const placeholderVideoUrl = "https://lvpr.tv/?v=55171riihgrsbqw8";
  const placeholderVideoMp4 = "https://vod-cdn.lp-playback.studio/raw/jxf4iblf6wlsyor6526t4tcmtmqa/catalyst-vod-com/hls/55171riihgrsbqw8/1920p0.mp4?tkn=4ba6c6b6778fb";
  
  // Fetch videos and user balance on component mount


  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // In a real implementation, these would be API calls
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Mock videos data
        const mockVideos = [
          {
            id: 'video_1',
            prompt: 'A futuristic city with flying cars and neon lights',
            url: placeholderVideoUrl,
            videoMp4: placeholderVideoMp4,
            thumbnail: placeholderVideoUrl,
            creator: '0x1234...5678',
            choices: [
              { 
                id: 'choice1_1', 
                text: 'The city continues to evolve with advanced technology', 
                votes: 125,
                staked: 2500,
                url: placeholderVideoUrl
              },
              { 
                id: 'choice1_2', 
                text: 'Nature reclaims parts of the city, creating a balance', 
                votes: 87,
                staked: 1750,
                url: placeholderVideoUrl
              }
            ],
            endTime: new Date(Date.now() + 86400000).toISOString() // 24 hours from now
          },
          {
            id: 'video_2',
            prompt: 'An underwater expedition discovers an ancient civilization',
            url: placeholderVideoUrl,
            videoMp4: placeholderVideoMp4,
            thumbnail: placeholderVideoUrl,
            creator: '0x9876...4321',
            choices: [
              { 
                id: 'choice2_1', 
                text: 'The explorers find advanced technology beyond human understanding', 
                votes: 210,
                staked: 4200,
                url: placeholderVideoUrl
              },
              { 
                id: 'choice2_2', 
                text: 'They discover the civilization is still active and make first contact', 
                votes: 195,
                staked: 3900,
                url: placeholderVideoUrl
              }
            ],
            endTime: new Date(Date.now() + 43200000).toISOString() // 12 hours from now
          }
        ];
        
        setVideos(mockVideos);
        
        // Mock user balance if authenticated
        if (isAuthenticated) {
          setUserBalance(1000); // Mock balance of 1000 Honors
        }
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load videos. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isAuthenticated]);

  // Handle stake amount input change
  const handleStakeAmountChange = (e) => {
    // Only allow numbers
    const value = e.target.value.replace(/[^0-9]/g, '');
    setStakeAmount(value);
  };

  // Handle choice selection
  const handleChoiceSelect = (videoId, choiceId) => {
    setActiveVideo(videoId);
    setSelectedChoice(choiceId);
    setError(null);
    setSuccessMessage(null);
  };

  // Handle stake and vote submission
  const handleStakeAndVote = async () => {
    if (!isAuthenticated) {
      setError('Please connect your wallet to vote');
      return;
    }

    if (!activeVideo || !selectedChoice) {
      setError('Please select a choice to vote for');
      return;
    }

    if (!stakeAmount || parseInt(stakeAmount) <= 0) {
      setError('Please enter a valid stake amount');
      return;
    }

    if (parseInt(stakeAmount) > userBalance) {
      setError('Insufficient balance for this stake');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // In a real implementation, this would call your backend API
      // and interact with the blockchain through DeBridge
      console.log('Staking and voting:', {
        videoId: activeVideo,
        choiceId: selectedChoice,
        stakeAmount: parseInt(stakeAmount),
        voter: userAddress
      });
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Update local state to reflect the vote
      setVideos(prevVideos => 
        prevVideos.map(video => {
          if (video.id === activeVideo) {
            return {
              ...video,
              choices: video.choices.map(choice => {
                if (choice.id === selectedChoice) {
                  return {
                    ...choice,
                    votes: choice.votes + 1,
                    staked: choice.staked + parseInt(stakeAmount)
                  };
                }
                return choice;
              })
            };
          }
          return video;
        })
      );
      
      // Update user balance
      setUserBalance(prevBalance => prevBalance - parseInt(stakeAmount));
      
      // Reset form
      setStakeAmount('');
      setSuccessMessage('Your vote has been recorded successfully!');
      
      // After 3 seconds, clear the success message
      setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
    } catch (err) {
      console.error('Error staking and voting:', err);
      setError('Failed to process your vote. Please try again.');
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
      
      {loading && videos.length === 0 ? (
        <div className="loading">Loading videos...</div>
      ) : error && videos.length === 0 ? (
        <div className="error-message">{error}</div>
      ) : (
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
              <div className="stake-input-container">
                <label htmlFor="stake-amount">Stake Amount (Honors):</label>
                <input
                  id="stake-amount"
                  type="text"
                  value={stakeAmount}
                  onChange={handleStakeAmountChange}
                  placeholder="Enter amount to stake"
                  disabled={!isAuthenticated || loading}
                />
              </div>
              <button 
                className="stake-vote-btn"
                onClick={handleStakeAndVote}
                disabled={!isAuthenticated || loading || !selectedChoice || !stakeAmount}
              >
                {loading ? 'Processing...' : 'Stake & Vote'}
              </button>
              <p className="voting-info">
                Your stake will be used to support your chosen option. If your choice wins, 
                you'll receive rewards proportional to your stake. A portion of the rewards 
                will also go to the content creator.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Voting;
