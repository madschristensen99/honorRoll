import React, { useState, useEffect } from 'react';
import { useTomo } from '@tomo-inc/tomo-web-sdk';
import './AuthButton.css';

const AuthButton = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [userBalance, setUserBalance] = useState(1000); // Mock balance of 1000 Honors
  const [showBalance, setShowBalance] = useState(false);
  const { openConnectModal, connected, disconnect, evmAddress } = useTomo();

  // Handle authentication
  const handleAuth = async () => {
    if (connected) {
      try {
        // Disconnect wallet using Tomo SDK
        await disconnect();
        window.localStorage.removeItem('honor_roll_auth');
      } catch (err) {
        console.error('Error disconnecting wallet:', err);
        setError('Failed to disconnect. Please try again.');
      }
      return;
    }

    // Handle login
    try {
      setIsLoading(true);
      setError('');
      
      // Open Tomo connect modal
      openConnectModal();
    } catch (err) {
      console.error('Authentication error:', err);
      setError('Failed to connect. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Update auth state when Tomo connection changes
  useEffect(() => {
    if (connected && evmAddress) {
      // Store auth state in localStorage for persistence
      window.localStorage.setItem('honor_roll_auth', JSON.stringify({
        address: evmAddress,
        timestamp: Date.now()
      }));
      
      // In a real implementation, we would fetch the user's balance from the blockchain
      // For now, we'll use a mock balance
      setUserBalance(1000);
      setShowBalance(true);
    } else {
      setShowBalance(false);
    }
  }, [connected, evmAddress]);
  
  // Force the balance to show on component mount if we're connected
  useEffect(() => {
    if (connected) {
      setShowBalance(true);
    }
  }, []);

  // Format wallet address for display
  const formatAddress = (address) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <div className="auth-container">
      {connected && (
        <>
          <div className="user-balance">
            <span className="balance-amount">{userBalance}</span>
            <span className="balance-label">Honors</span>
          </div>
          {evmAddress && (
            <div className="user-address">
              {formatAddress(evmAddress)}
            </div>
          )}
        </>
      )}
      <div className="auth-button">
        <button 
          className={`connect-btn ${connected ? 'logout' : 'login'}`}
          onClick={handleAuth}
          disabled={isLoading}
        >
          {isLoading ? 'Connecting...' : connected ? 'Disconnect' : 'Connect Wallet'}
        </button>
      </div>
      {error && <div className="auth-error">{error}</div>}
    </div>
  );
};

export default AuthButton;
