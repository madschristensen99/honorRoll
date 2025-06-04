import React, { useState } from 'react';
import { useTomo } from '@tomo-inc/tomo-web-sdk';
import './BuyHonors.css';

const BuyHonors = () => {
  const { connected: isAuthenticated, evmAddress: userAddress } = useTomo();
  const [amount, setAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  
  // Handle amount input change
  const handleAmountChange = (e) => {
    setAmount(e.target.value);
  };
  
  // Handle buy honors
  const handleBuyHonors = async () => {
    if (!isAuthenticated) {
      setError('Please connect your wallet to buy Honors');
      return;
    }
    
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    
    setIsProcessing(true);
    setError(null);
    setSuccessMessage('');
    
    try {
      // In a real implementation, this would call your backend API
      // For now, we'll simulate a purchase
      console.log('Buying Honors:', amount);
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Mock successful purchase
      setSuccessMessage(`Successfully purchased ${amount} Honors!`);
      setAmount('');
    } catch (err) {
      console.error('Error buying Honors:', err);
      setError('Failed to complete purchase. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };
  
  return (
    <div className="buy-honors-container">
      <h2>Buy Honors</h2>
      
      {!isAuthenticated ? (
        <div className="auth-message">
          <p>Connect your wallet to buy Honors</p>
        </div>
      ) : (
        <>
          <div className="honors-info">
            <p>Honors are the official currency of Honor Roll. Use them to:</p>
            <ul>
              <li>Stake on video choices</li>
              <li>Earn rewards when your choices win</li>
              <li>Support creators you love</li>
            </ul>
          </div>
          
          <div className="buy-form">
            <div className="amount-input-container">
              <label htmlFor="honors-amount">Amount of Honors to buy:</label>
              <input
                id="honors-amount"
                type="number"
                min="1"
                value={amount}
                onChange={handleAmountChange}
                placeholder="Enter amount"
                disabled={isProcessing}
              />
            </div>
            
            <div className="price-display">
              <p>Price: ${(parseFloat(amount) || 0).toFixed(2)} USD</p>
              <p className="price-note">1 Honor = $1 USD</p>
            </div>
            
            <button 
              className="buy-btn"
              onClick={handleBuyHonors}
              disabled={isProcessing || !amount}
            >
              {isProcessing ? 'Processing...' : 'Buy Honors'}
            </button>
            
            {error && <div className="error-message">{error}</div>}
            {successMessage && <div className="success-message">{successMessage}</div>}
          </div>
        </>
      )}
    </div>
  );
};

export default BuyHonors;
