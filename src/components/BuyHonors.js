import React, { useState, useEffect } from 'react';
import { useTomo } from '@tomo-inc/tomo-web-sdk';
import { useWeb3 } from '../context/Web3Context';
import * as ethers from 'ethers';
import './BuyHonors.css';

// Base RPC URL
const BASE_RPC_URL = 'https://mainnet.base.org';

// USDCManager ABI - just the function we need
const USDC_MANAGER_ABI = [
  "function depositUSDC(uint256 amount) returns (bool)"
];

// Base Mainnet addresses
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_MANAGER_ADDRESS = '0x53c31B1eE936Ec146bDa2A39A99853Ef9B9C664a';

// USDCManager ABI - just the functions we need
const USDCManagerABI = [
  "function depositUSDC(uint256 amount)"
];

// USDC ABI - just the functions we need
const USDC_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

const BuyHonors = () => {
  const { connected: isAuthenticated, providers } = useTomo();
  const { contracts, refreshHonorBalance, usdcBalance, refreshUsdcBalance } = useWeb3();
  const [amount, setAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [txHash, setTxHash] = useState('');
  const [userAddress, setUserAddress] = useState('');
  
  // We're using the addresses defined at the top of the file
  // USDC_ADDRESS and USDC_MANAGER_ADDRESS
  
  // Get the user's address when the component mounts or when the provider changes
  useEffect(() => {
    const getAddress = async () => {
      if (providers?.ethereumProvider && isAuthenticated) {
        try {
          // Get accounts from the provider
          const accounts = await providers.ethereumProvider.request({
            method: 'eth_requestAccounts'
          });
          
          if (accounts && accounts.length > 0) {
            console.log('Got user address:', accounts[0]);
            setUserAddress(accounts[0]);
          } else {
            console.error('No accounts returned from provider');
          }
        } catch (error) {
          console.error('Error getting accounts:', error);
        }
      }
    };
    
    getAddress();
  }, [providers, isAuthenticated]);
  
  // Refresh USDC balance on component mount and when address changes
  useEffect(() => {
    if (isAuthenticated && userAddress) {
      console.log('BuyHonors: Refreshing USDC balance');
      refreshUsdcBalance();
    }
  }, [isAuthenticated, userAddress, refreshUsdcBalance]);
  
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
    
    if (!userAddress) {
      setError('Could not get your wallet address. Please reconnect your wallet.');
      return;
    }
    
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    
    // Check if user has enough USDC
    if (parseFloat(usdcBalance) < parseFloat(amount)) {
      setError(`Insufficient USDC balance. You have ${usdcBalance} USDC.`);
      return;
    }
    
    setIsProcessing(true);
    setError(null);
    setSuccessMessage('');
    
    try {
      // Use the USDC decimals (6 for USDC on Base)
      const decimals = 6; // USDC on Base has 6 decimals
      
      // Get the Tomo SDK's Ethereum provider
      if (!providers?.ethereumProvider) {
        throw new Error('Tomo Ethereum provider not available');
      }
      
      console.log('Using Tomo Ethereum provider with address:', userAddress);
      console.log('Contract addresses:', { USDC: USDC_ADDRESS, USDCManager: USDC_MANAGER_ADDRESS });
      console.log('User address:', userAddress);
      
      // Skip approval and go directly to deposit
      console.log('Bypassing approval step and going directly to deposit...');
      console.log('Amount in USDC:', amount);
      
      // Step 1: Deposit USDC to get HONOR tokens
      console.log('Depositing USDC to get HONOR tokens...');
      
      // Define amountInWei outside the try block so it's accessible in the catch block
      const amountInWei = ethers.parseUnits(amount, decimals);
      console.log('Amount in wei for deposit:', amountInWei.toString());
      
      let depositResult;
      
      try {
        console.log('Starting deposit transaction...');
        
        // Create the deposit transaction data using the correct function signature
        const depositInterface = new ethers.Interface([
          "function depositUSDC(uint256 amount) returns (bool)"
        ]);
        
        const depositData = depositInterface.encodeFunctionData("depositUSDC", [
          amountInWei
        ]);
        
        console.log('Deposit data:', depositData);
        
        // Send the deposit transaction using Tomo SDK's sendTransaction method
        const depositParams = {
          from: userAddress,
          to: USDC_MANAGER_ADDRESS,
          data: depositData,
          value: '0x0',
          gasLimit: '0x100000' // Significantly higher gas limit (1,048,576 gas)
        };
        
        console.log('Sending deposit transaction with params:', depositParams);
        
        // Use the sendTransaction method directly
        depositResult = await providers.ethereumProvider.sendTransaction(depositParams);
        
        console.log('Deposit transaction submitted:', depositResult);
      } catch (depositError) {
        console.error('Error during deposit transaction:', depositError);
        console.log('Deposit error details:', JSON.stringify(depositError, Object.getOwnPropertyNames(depositError)));
        
        // Try fallback with request method
        console.log('Trying fallback with request method...');
        
        const fallbackInterface = new ethers.Interface([
          "function depositUSDC(uint256 amount) returns (bool)"
        ]);
        
        const fallbackData = fallbackInterface.encodeFunctionData("depositUSDC", [
          amountInWei
        ]);
        
        const tx = {
          from: userAddress,
          to: USDC_MANAGER_ADDRESS,
          data: fallbackData,
          value: '0x0',
          gas: '0x100000' // Using gas instead of gasLimit for the request method
        };
        
        console.log('Fallback transaction parameters:', tx);
        
        depositResult = await providers.ethereumProvider.request({
          method: 'eth_sendTransaction',
          params: [tx]
        });
        
        console.log('Deposit transaction submitted with fallback method:', depositResult);
      }
      
      // If we got here, one of the methods worked
      setTxHash(depositResult);
      
      // After successful deposit, refresh balances
      console.log('Deposit successful, refreshing balances...');
      await refreshHonorBalance();
      await refreshUsdcBalance();
      
      setSuccessMessage(`Successfully purchased ${amount} Honors!`);
      setAmount('');
    } catch (error) {
      console.error('Error buying Honors:', error);
      setError(`Failed to buy Honors: ${error.message}`);
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
            <h3 className="honors-headline">✨ UNLOCK THE POWER OF HONOR TOKENS! ✨</h3>
            <p className="honors-tagline">The ULTIMATE digital currency that transforms YOU from viewer to creator!</p>
            
            <div className="honors-benefits">
              <div className="benefit-item">
                <span className="benefit-icon">🎬</span>
                <h4>CREATE & SHAPE THE STORY!</h4>
                <p>Generate amazing AI videos for just 20 HONOR tokens and cast powerful votes that ACTUALLY determine which videos continue the story! YOUR choices create the narrative!</p>
              </div>
              
              <div className="benefit-item">
                <span className="benefit-icon">💰</span>
                <h4>EARN REAL REWARDS!</h4>
                <p>When your voted videos win, you earn AMAZING yields through Aave-powered smart contracts! Vote smart, earn BIG!</p>
              </div>
              
              <div className="benefit-item">
                <span className="benefit-icon">🚀</span>
                <h4>JOIN THE REVOLUTION!</h4>
                <p>Be part of the world's first decentralized storytelling platform with IP rights secured on Story Protocol!</p>
              </div>
              
              <div className="benefit-item">
                <span className="benefit-icon">🌟</span>
                <h4>EMPOWER CREATORS!</h4>
                <p>Your HONOR tokens directly support the brilliant minds behind the videos you love! Build the creator economy of tomorrow!</p>
              </div>
            </div>
            
            <p className="honors-cta">Don't just watch the future of entertainment — OWN IT with HONOR tokens!</p>
          </div>
          
          <div className="buy-form">
            <div className="amount-input-container">
              <label htmlFor="honors-amount">✨ How many Honors do you want?</label>
              <input
                id="honors-amount"
                type="number"
                min="1"
                value={amount}
                onChange={handleAmountChange}
                placeholder="Enter a magical number"
                disabled={isProcessing}
              />
            </div>
            
            <div className="price-display">
              <p>Price: ${(parseFloat(amount) || 0).toFixed(2)} USD</p>
              <p className="price-note">1 Honor = $1 USD (USDC Balance: {parseFloat(usdcBalance || 0).toFixed(2)})</p>
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
