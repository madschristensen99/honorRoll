import React, { useState, useEffect } from 'react';
import { useTomo, getWalletState } from '@tomo-inc/tomo-web-sdk';
import { useWeb3 } from '../context/Web3Context';
import './AuthButton.css';

const AuthButton = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showBalance, setShowBalance] = useState(false);
  const { connected, evmAddress, providers, openConnectModal, disconnect } = useTomo();
  const { honorBalance, ethBalance, usdcBalance, refreshHonorBalance, refreshEthBalance, refreshUsdcBalance, ensureBaseNetwork, isBaseNetwork, chainId, isLoading: web3Loading } = useWeb3();

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
  
  // Handle network switch
  const handleSwitchToBase = async () => {
    try {
      setIsLoading(true);
      await ensureBaseNetwork();
    } catch (err) {
      console.error('Error switching to Base network:', err);
      setError('Failed to switch to Base network. Please try manually.');
    } finally {
      setIsLoading(false);
    }
  };

  // Update auth state when Tomo connection changes
  useEffect(() => {
    const getTomoAddress = async () => {
      // Try to get address from evmAddress or getWalletState as fallback
      let address = evmAddress;
      if (!address && connected && providers?.ethereumProvider) {
        try {
          const walletState = await getWalletState();
          address = walletState?.address;
          console.log('AuthButton: Got address from getWalletState:', address);
        } catch (error) {
          console.error('Error getting wallet state:', error);
        }
      }
      
      console.log('AuthButton: Connection state changed', { connected, evmAddress, fallbackAddress: address, hasProviders: !!providers });
      
      if (connected && address) {
        // Store auth state in localStorage for persistence
        window.localStorage.setItem('honor_roll_auth', JSON.stringify({
          address: address,
          timestamp: Date.now()
        }));
        
        setShowBalance(true);
        
        // Ensure we're on Base network first
        console.log('AuthButton: Ensuring Base network...');
        try {
          const success = await ensureBaseNetwork();
          console.log('AuthButton: Network switch result:', success);
          if (success) {
            console.log('AuthButton: Successfully switched to Base network, refreshing balances');
            // Refresh balances from blockchain with a small delay to ensure network switch is complete
            setTimeout(() => {
              console.log('AuthButton: Refreshing balances after network switch');
              refreshHonorBalance();
              refreshEthBalance();
              refreshUsdcBalance();
            }, 1000);
          }
        } catch (error) {
          console.error('AuthButton: Error ensuring Base network:', error);
          setError('Failed to switch to Base network. Please try manually.');
        }
      } else {
        console.log('AuthButton: Not connected or no address', { connected, evmAddress, fallbackAddress: address });
        setShowBalance(false);
      }
    };
    
    getTomoAddress();
  }, [connected, evmAddress, providers, refreshHonorBalance, refreshEthBalance, refreshUsdcBalance, ensureBaseNetwork]);

  // Force the balance to show on component mount if we're connected
  // and periodically refresh balances
  useEffect(() => {
    if (connected) {
      setShowBalance(true);
      
      // Refresh balances immediately
      refreshHonorBalance();
      refreshEthBalance();
      refreshUsdcBalance();
      
      // Set up periodic refresh every 30 seconds
      const refreshInterval = setInterval(() => {
        console.log('Periodic balance refresh');
        refreshHonorBalance();
        refreshEthBalance();
        refreshUsdcBalance();
      }, 30000);
      
      return () => clearInterval(refreshInterval);
    }
  }, [connected, refreshHonorBalance, refreshEthBalance, refreshUsdcBalance]);

  // Format wallet address for display
  const formatAddress = (address) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <div className="auth-container">
      {connected && (
        <>
          <div className="user-balance honor-balance">
            <span className="balance-amount">{parseFloat(honorBalance || 0).toFixed(2)}</span>
            <span className="balance-label">Honors</span>
          </div>
          <div className="user-balance eth-balance" onClick={refreshEthBalance} title="Click to refresh ETH balance">
            <span className="balance-amount">{parseFloat(ethBalance || 0).toFixed(4)}</span>
            <span className="balance-label">ETH</span>
          </div>
          <div className="user-balance usdc-balance" onClick={refreshUsdcBalance} title="Click to refresh USDC balance">
            <span className="balance-amount">{parseFloat(usdcBalance || 0).toFixed(2)}</span>
            <span className="balance-label">USDC</span>
          </div>
          {evmAddress && (
            <div className="user-address">
              {formatAddress(evmAddress)}
              {!isBaseNetwork && (
                <button className="switch-network-btn" onClick={handleSwitchToBase} disabled={isLoading}>
                  Switch to Base
                </button>
              )}
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
