import React, { useState, useEffect } from 'react';
import { useTomo } from '@tomo-inc/tomo-web-sdk';
import { useWeb3 } from '../context/Web3Context';
import * as ethers from 'ethers';
import contractAddresses from '../contracts/addresses';
import './BuyHonors.css';

// Base Mainnet chain ID
const BASE_CHAIN_ID = 8453;

const BuyHonors = () => {
  const { connected: isAuthenticated, providers } = useTomo();
  const { refreshHonorBalance, usdcBalance, refreshUsdcBalance } = useWeb3();
  const [amount, setAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [userAddress, setUserAddress] = useState('');
  const [allowance, setAllowance] = useState('0');
  const [isCheckingAllowance, setIsCheckingAllowance] = useState(false);
  
  // We're using the addresses from the centralized addresses.js file
  // Access them via contractAddresses[BASE_CHAIN_ID].USDC_TOKEN and contractAddresses[BASE_CHAIN_ID].USDC_MANAGER
  
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
  
  // Refresh USDC balance and check allowance on component mount and when address changes
  useEffect(() => {
    if (isAuthenticated && userAddress) {
      console.log('BuyHonors: Refreshing USDC balance');
      refreshUsdcBalance();
      checkAllowance();
    }
  }, [isAuthenticated, userAddress, refreshUsdcBalance]);
  
  // Handle amount input change
  const handleAmountChange = (e) => {
    setAmount(e.target.value);
  };
  
  // Check USDC allowance for USDCManager contract
  const checkAllowance = async () => {
    if (!isAuthenticated || !userAddress || !providers?.ethereumProvider) {
      return;
    }
    
    setIsCheckingAllowance(true);
    
    try {
      console.log('Checking USDC allowance for USDCManager...');
      
      // Create the allowance function call data
      const allowanceInterface = new ethers.Interface([
        "function allowance(address owner, address spender) view returns (uint256)"
      ]);
      
      const allowanceData = allowanceInterface.encodeFunctionData("allowance", [
        userAddress,
        contractAddresses[BASE_CHAIN_ID].USDC_MANAGER
      ]);
      
      // Call the USDC contract to get the allowance
      const allowanceHex = await providers.ethereumProvider.request({
        method: 'eth_call',
        params: [{
          to: contractAddresses[BASE_CHAIN_ID].USDC_TOKEN,
          data: allowanceData
        }, 'latest']
      });
      
      // Convert hex allowance to decimal
      const allowanceValue = ethers.formatUnits(allowanceHex, 6); // USDC has 6 decimals
      console.log('Current USDC allowance:', allowanceValue);
      setAllowance(allowanceValue);
    } catch (error) {
      console.error('Error checking allowance:', error);
      setAllowance('0');
    } finally {
      setIsCheckingAllowance(false);
    }
  };
  
  // Handle USDC approval
  const handleApproveUSDC = async () => {
    if (!isAuthenticated) {
      setError('Please connect your wallet to approve USDC');
      return;
    }
    
    if (!userAddress) {
      setError('Could not get your wallet address. Please reconnect your wallet.');
      return;
    }
    
    setIsApproving(true);
    setError(null);
    setSuccessMessage('');
    
    try {
      // Get the Tomo SDK's Ethereum provider
      if (!providers?.ethereumProvider) {
        throw new Error('Tomo Ethereum provider not available');
      }
      
      console.log('Approving USDC for USDCManager...');
      
      // Create the approval function call data
      const approvalInterface = new ethers.Interface([
        "function approve(address spender, uint256 amount) returns (bool)"
      ]);
      
      // Approve a very large amount (max uint256)
      const maxUint256 = ethers.MaxUint256;
      
      const approvalData = approvalInterface.encodeFunctionData("approve", [
        contractAddresses[BASE_CHAIN_ID].USDC_MANAGER,
        maxUint256
      ]);
      
      // Send the approval transaction
      const approvalParams = {
        from: userAddress,
        to: contractAddresses[BASE_CHAIN_ID].USDC_TOKEN,
        data: approvalData,
        value: '0x0',
        gasLimit: '0x30000' // 196,608 gas
      };
      
      console.log('Sending approval transaction with params:', approvalParams);
      
      // Use the request method with eth_sendTransaction instead of sendTransaction directly
      // This is more compatible with different wallet providers
      console.log('Using eth_sendTransaction for better wallet compatibility');
      const approvalResult = await providers.ethereumProvider.request({
        method: 'eth_sendTransaction',
        params: [approvalParams]
      });
      console.log('Approval transaction submitted:', approvalResult);
      
      setSuccessMessage('USDC approval successful! You can now buy Honors.');
      
      // Update allowance after approval
      setTimeout(() => {
        checkAllowance();
      }, 3000); // Wait 3 seconds for the transaction to be mined
      
    } catch (error) {
      console.error('Error approving USDC:', error);
      setError(`Failed to approve USDC: ${error.message}`);
    } finally {
      setIsApproving(false);
    }
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
    
    // Check if user has approved enough USDC
    const amountValue = parseFloat(amount);
    if (parseFloat(allowance) < amountValue) {
      setError(`Please approve USDC first. Current allowance: ${allowance} USDC`);
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
      console.log('Contract addresses:', { 
        USDC: contractAddresses[BASE_CHAIN_ID].USDC_TOKEN, 
        USDCManager: contractAddresses[BASE_CHAIN_ID].USDC_MANAGER 
      });
      console.log('User address:', userAddress);
      
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
          to: contractAddresses[BASE_CHAIN_ID].USDC_MANAGER,
          data: depositData,
          value: '0x0',
          gasLimit: '0x100000' // Significantly higher gas limit (1,048,576 gas)
        };
        
        console.log('Sending deposit transaction with params:', depositParams);
        
        // Use the request method with eth_sendTransaction directly
        // This is more compatible with different wallet providers
        console.log('Using eth_sendTransaction for better wallet compatibility');
        
        // Rename gasLimit to gas for compatibility
        const txParams = {
          from: userAddress,
          to: contractAddresses[BASE_CHAIN_ID].USDC_MANAGER,
          data: depositData,
          value: '0x0',
          gas: '0x100000' // Using gas instead of gasLimit for better compatibility
        };
        
        console.log('Transaction parameters:', txParams);
        
        depositResult = await providers.ethereumProvider.request({
          method: 'eth_sendTransaction',
          params: [txParams]
        });
        
        console.log('Deposit transaction submitted:', depositResult);
      } catch (depositError) {
        console.error('Error during deposit transaction:', depositError);
        throw depositError; // Re-throw to be caught by the outer try/catch
      }
      
      // If we got here, one of the methods worked
      // Store the transaction result (hash) in a local variable
      const transactionHash = depositResult;
      
      // After successful deposit, refresh balances
      console.log('Deposit successful, refreshing balances...');
      
      // Wait a moment for the transaction to be processed
      console.log('Waiting for transaction to be processed before refreshing balances...');
      await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
      
      // Refresh USDC and Honor balances
      await refreshUsdcBalance();
      await refreshHonorBalance();
      
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
              <p className="allowance-note">USDC Allowance: {isCheckingAllowance ? 'Checking...' : `${parseFloat(allowance || 0).toFixed(2)}`}</p>
            </div>
            
            <div className="button-container">
              <button 
                className="approve-btn"
                onClick={handleApproveUSDC}
                disabled={isApproving || isProcessing}
              >
                {isApproving ? 'Approving...' : 'Approve USDC'}
              </button>
              
              <button 
                className="buy-btn"
                onClick={handleBuyHonors}
                disabled={isProcessing || !amount || parseFloat(allowance) < parseFloat(amount || 0)}
              >
                {isProcessing ? 'Processing...' : 'Buy Honors'}
              </button>
            </div>
            
            {error && <div className="error-message">{error}</div>}
            {successMessage && <div className="success-message">{successMessage}</div>}
          </div>
        </>
      )}
    </div>
  );
};

export default BuyHonors;
