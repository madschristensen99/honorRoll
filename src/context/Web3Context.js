import React, { createContext, useContext, useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useTomo, getWalletState } from '@tomo-inc/tomo-web-sdk';
import contractAddresses from '../contracts/addresses';

// Import ABIs
import HonorTokenABI from '../contracts/abis/HonorToken.json';
import VideoManagerABI from '../contracts/abis/VideoManager.json';
import VotingManagerABI from '../contracts/abis/VotingManager.json';
import USDCManagerABI from '../contracts/abis/USDCManager.json';
import YieldManagerABI from '../contracts/abis/YieldManager.json';
import CrossChainBridgeABI from '../contracts/abis/CrossChainBridge.json';

// Custom RPC URL from .env file
const CUSTOM_RPC_URL = process.env.REACT_APP_BASE_RPC_URL || 'https://lb.drpc.org/ogrpc?network=base&dkey=AmNgmLfXikwWhpaarzWUjEmU59gkRdwR8ImsKlzbRHZc';

// USDC ABI for balanceOf function
const USDC_ABI = [
  {
    "constant": true,
    "inputs": [{ "name": "_owner", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "name": "balance", "type": "uint256" }],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "decimals",
    "outputs": [{ "name": "", "type": "uint8" }],
    "type": "function"
  }
];

// Create context
const Web3Context = createContext();

// Base network constants
const BASE_CHAIN_ID = 8453;
const BASE_NETWORK_NAME = 'Base Mainnet';

export const Web3Provider = ({ children }) => {
  const { connected, evmAddress, provider, providers } = useTomo();
  const [contracts, setContracts] = useState({});
  const [chainId, setChainId] = useState(null);
  const [signer, setSigner] = useState(null);
  const [honorBalance, setHonorBalance] = useState(0);
  const [ethBalance, setEthBalance] = useState(0);
  const [usdcBalance, setUsdcBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [initialized, setInitialized] = useState(false);
  const [networkSwitchAttempted, setNetworkSwitchAttempted] = useState(false);

  // Switch to Base network if needed
  useEffect(() => {
    const switchToBaseNetwork = async () => {
      if (!connected || !provider || !providers?.ethereumProvider) return;
      
      try {
        const currentChainId = await providers.ethereumProvider.getChainId();
        console.log('Web3Context: Current chain ID:', currentChainId);
        
        if (currentChainId !== BASE_CHAIN_ID.toString() && !networkSwitchAttempted) {
          console.log('Web3Context: Switching to Base network...');
          setNetworkSwitchAttempted(true);
          
          try {
            await providers.ethereumProvider.switchChain(BASE_CHAIN_ID.toString());
            console.log('Web3Context: Successfully switched to Base network');
          } catch (switchError) {
            console.error('Web3Context: Error switching to Base network:', switchError);
            setError('Please switch to Base network manually.');
          }
        }
      } catch (err) {
        console.error('Web3Context: Error checking chain ID:', err);
      }
    };
    
    switchToBaseNetwork();
  }, [connected, provider, providers, networkSwitchAttempted]);

  // Initialize contracts when provider and chainId are available
  useEffect(() => {
    const initializeContracts = async () => {
      console.log('Web3Context: Initialize contracts called', { connected, provider, evmAddress, providers });
      
      // If wallet is not connected, we can still try to initialize contracts but with warnings
      if (!connected || !providers?.ethereumProvider) {
        console.log('Web3Context: Missing connection data, attempting to initialize anyway');
        // Don't set error here, let the app try to work
      }
      
      try {
        setIsLoading(true);
        setError(null);
        
        // Get wallet address - use evmAddress or fallback to getWalletState
        let walletAddress = evmAddress;
        if (!walletAddress) {
          try {
            const walletState = await getWalletState();
            walletAddress = walletState?.address;
            console.log('Web3Context: Got address from getWalletState:', walletAddress);
          } catch (error) {
            console.error('Web3Context: Error getting wallet state:', error);
          }
        }
        
        if (!walletAddress) {
          console.log('Web3Context: No wallet address available');
          setError('Could not get wallet address. Please reconnect your wallet.');
          setIsLoading(false);
          return;
        }
        
        // Get chain ID from Tomo provider
        console.log('Web3Context: Getting chain ID from Tomo provider...');
        const chainIdValue = await providers.ethereumProvider.getChainId();
        const currentChainId = typeof chainIdValue === 'string' && chainIdValue.startsWith('0x') 
          ? parseInt(chainIdValue, 16) 
          : Number(chainIdValue);
        console.log('Web3Context: Connected to network with chain ID:', currentChainId);
        setChainId(currentChainId);
        
        // Check if we have addresses for this chain
        if (!contractAddresses[currentChainId]) {
          console.log('Web3Context: Unsupported network', { chainId: currentChainId, availableChains: Object.keys(contractAddresses) });
          console.warn(`Unsupported network: Chain ID ${currentChainId}. Using Base Mainnet addresses as fallback.`);
          // Use Base Mainnet (8453) as fallback
          currentChainId = 8453;
        }
        console.log('Web3Context: Found contract addresses for chain', currentChainId);
        
        // Create ethers provider and signer for contract interactions
        console.log('Web3Context: Creating ethers provider and signer...');
        // We need to use the Tomo provider's underlying provider for ethers
        const ethersProvider = new ethers.BrowserProvider(providers.ethereumProvider);
        const ethSigner = await ethersProvider.getSigner();
        setSigner(ethSigner);
        const signerAddress = await ethSigner.getAddress();
        console.log('Web3Context: Got signer', { address: signerAddress });
        
        // Verify wallet address matches signer address
        if (walletAddress.toLowerCase() !== signerAddress.toLowerCase()) {
          console.warn('Web3Context: Wallet address does not match signer address', { walletAddress, signerAddress });
        }
        
        // Initialize contract instances
        console.log('Web3Context: Initializing contract instances...');
        const addresses = contractAddresses[currentChainId];
        console.log('Web3Context: Contract addresses:', addresses);
        
        try {
          console.log('Web3Context: Creating contract instances with addresses:', addresses);
          
          const contractInstances = {
            honorToken: new ethers.Contract(addresses.HONOR_TOKEN, HonorTokenABI, ethSigner),
            videoManager: new ethers.Contract(addresses.VIDEO_MANAGER, VideoManagerABI, ethSigner),
            votingManager: new ethers.Contract(addresses.VOTING_MANAGER, VotingManagerABI, ethSigner),
            usdcManager: new ethers.Contract(addresses.USDC_MANAGER, USDCManagerABI, ethSigner),
            yieldManager: new ethers.Contract(addresses.YIELD_MANAGER, YieldManagerABI, ethSigner),
            crossChainBridge: new ethers.Contract(addresses.CROSS_CHAIN_BRIDGE, CrossChainBridgeABI, ethSigner)
          };
          
          // Log contract instances for debugging
          console.log('Web3Context: Contract instances:', {
            honorToken: contractInstances.honorToken.target,
            videoManager: contractInstances.videoManager.target,
            usdcManager: contractInstances.usdcManager.target
          });
          
          // Always set contracts as initialized - we'll handle errors at the function level
          setInitialized(true);
          
          // Log contract instances but don't test them yet
          console.log('Web3Context: Contract instances initialized');
        
          setContracts(contractInstances);
          
          // Fetch initial honor balance
          console.log('Web3Context: Fetching initial HONOR balance...');
          try {
            const balance = await contractInstances.honorToken.balanceOf(walletAddress);
            const formattedBalance = ethers.formatUnits(balance, 18);
            console.log('Web3Context: HONOR balance =', formattedBalance);
            setHonorBalance(formattedBalance);
          } catch (err) {
            console.error('Web3Context: Error fetching HONOR balance:', err);
          }
          
          // Fetch ETH balance using Tomo provider directly
          console.log('Web3Context: Fetching ETH balance using Tomo provider...');
          try {
            // Use the Tomo provider's request method to get the balance
            const ethBalanceHex = await providers.ethereumProvider.request({
              method: 'eth_getBalance',
              params: [evmAddress, 'latest']
            });
            
            // Convert hex balance to decimal
            const ethBalanceWei = ethers.toBigInt(ethBalanceHex);
            const formattedEthBalance = ethers.formatEther(ethBalanceWei);
            console.log('Web3Context: ETH balance =', formattedEthBalance);
            setEthBalance(formattedEthBalance);
          } catch (err) {
            console.error('Web3Context: Error fetching ETH balance:', err);
          }
          
          // Fetch USDC balance using Tomo provider directly
          console.log('Web3Context: Fetching USDC balance using Tomo provider...');
          try {
            const usdcAddress = addresses.USDC_TOKEN;
            console.log('Web3Context: USDC address =', usdcAddress);
            
            if (!usdcAddress) {
              console.error('Web3Context: USDC address is undefined for chain ID', currentChainId);
              return;
            }
            
            // Use the Tomo provider's request method to call the USDC contract
            // First get decimals
            const decimalsHex = await providers.ethereumProvider.request({
              method: 'eth_call',
              params: [{
                to: usdcAddress,
                data: '0x313ce567' // Function selector for 'decimals()'
              }, 'latest']
            });
            
            const decimals = parseInt(decimalsHex, 16);
            console.log('Web3Context: USDC decimals =', decimals);
            
            // Encode the balanceOf function call with the user's address
            // Function selector for 'balanceOf(address)' is '0x70a08231'
            const encodedAddress = evmAddress.slice(2).padStart(64, '0');
            const data = `0x70a08231000000000000000000000000${encodedAddress}`;
            
            // Call the USDC contract to get the balance
            const usdcBalanceHex = await providers.ethereumProvider.request({
              method: 'eth_call',
              params: [{
                to: usdcAddress,
                data: data
              }, 'latest']
            });
            
            // Convert hex balance to decimal
            const usdcBalanceRaw = ethers.toBigInt(usdcBalanceHex);
            console.log('Web3Context: USDC raw balance =', usdcBalanceRaw.toString());
            
            const formattedUsdcBalance = ethers.formatUnits(usdcBalanceRaw, decimals);
            console.log('Web3Context: USDC formatted balance =', formattedUsdcBalance);
            
            setUsdcBalance(formattedUsdcBalance);
          } catch (err) {
            console.error('Web3Context: Error fetching USDC balance:', err);
          }
          
          // Mark initialization as complete
          setInitialized(true);
        } catch (err) {
          console.error('Web3Context: Error creating contract instances:', err);
          setError('Error initializing contracts. Please check console for details.');
        }
        
      } catch (err) {
        console.error('Error initializing contracts:', err);
        setError('Failed to initialize contracts. Please check your connection and try again.');
      } finally {
        setIsLoading(false);
      }
    };
    
    initializeContracts();
  }, [provider, connected, evmAddress]);
  
  // Update honor balance when address changes
  useEffect(() => {
    const updateBalance = async () => {
      if (!contracts.honorToken || !evmAddress) return;
      
      try {
        const balance = await contracts.honorToken.balanceOf(evmAddress);
        setHonorBalance(ethers.formatUnits(balance, 18));
      } catch (err) {
        console.error('Error fetching honor balance:', err);
      }
    };
    
    updateBalance();
  }, [contracts.honorToken, evmAddress]);
  
  // Function to refresh honor balance
  const refreshHonorBalance = async () => {
    if (!contracts.honorToken || !evmAddress) return;
    
    try {
      const balance = await contracts.honorToken.balanceOf(evmAddress);
      setHonorBalance(ethers.formatUnits(balance, 18));
      return ethers.formatUnits(balance, 18);
    } catch (err) {
      console.error('Error refreshing honor balance:', err);
      return honorBalance;
    }
  };
  
  // Function to refresh ETH balance using Tomo provider directly
  const refreshEthBalance = async () => {
    if (!connected || !providers?.ethereumProvider) {
      console.log('Cannot refresh ETH balance - not connected or no provider');
      return;
    }
    
    try {
      // Get wallet address from Tomo SDK
      let address;
      try {
        // Try to get from evmAddress first
        address = evmAddress;
        
        // If evmAddress is not available, try getWalletState
        if (!address) {
          const walletState = await getWalletState();
          address = walletState?.address;
        }
        
        if (!address) {
          console.log('Cannot refresh ETH balance - no wallet address');
          return;
        }
      } catch (error) {
        console.error('Error getting wallet address for ETH balance:', error);
        return;
      }
      
      console.log('Refreshing ETH balance for Tomo address:', address);
      
      // Use Tomo provider to get ETH balance with retry logic
      const balanceHex = await retryRpcCall(() => providers.ethereumProvider.request({
        method: 'eth_getBalance',
        params: [address, 'latest']
      }));
      
      const balance = ethers.formatEther(ethers.toBigInt(balanceHex));
      console.log('Updated ETH balance:', balance);
      setEthBalance(balance);
      return balance;
    } catch (err) {
      console.error('Error refreshing ETH balance:', err);
      return ethBalance;
    }
  };
  
  // Helper function to retry RPC calls with exponential backoff
  const retryRpcCall = async (fn, maxRetries = 3, initialDelay = 1000) => {
    let retries = 0;
    while (retries < maxRetries) {
      try {
        return await fn();
      } catch (error) {
        if (error.code === -32016 && error.message.includes('rate limit')) {
          retries++;
          if (retries >= maxRetries) throw error;
          const delay = initialDelay * Math.pow(2, retries - 1);
          console.log(`Rate limit hit, retrying in ${delay}ms (attempt ${retries} of ${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw error;
        }
      }
    }
  };

  // Function to refresh USDC balance using custom RPC URL
  const refreshUsdcBalance = async () => {
    if (!connected) {
      console.log('Cannot refresh USDC balance - not connected');
      return;
    }
    
    try {
      // Get wallet address from Tomo SDK
      let address;
      try {
        // Try to get from evmAddress first
        address = evmAddress;
        
        // If evmAddress is not available, try getWalletState
        if (!address) {
          const walletState = await getWalletState();
          address = walletState?.address;
        }
        
        if (!address) {
          console.log('Cannot refresh USDC balance - no wallet address');
          return;
        }
      } catch (error) {
        console.error('Error getting wallet address for USDC balance:', error);
        return;
      }
      
      // Create a direct provider using our custom RPC URL
      console.log('Getting chain ID using custom RPC URL:', CUSTOM_RPC_URL);
      const customProvider = new ethers.JsonRpcProvider(CUSTOM_RPC_URL);
      const network = await customProvider.getNetwork();
      const currentChainId = Number(network.chainId);
      console.log('Chain ID from custom provider:', currentChainId);
      setChainId(currentChainId); // Update the chainId state
      
      if (!contractAddresses[currentChainId]) {
        console.log('No contract addresses for chain ID', currentChainId);
        return;
      }
      
      console.log('Refreshing USDC balance for address:', address);
      const usdcAddress = contractAddresses[currentChainId].USDC_TOKEN;
      console.log('USDC token address:', usdcAddress);
      
      if (!usdcAddress) {
        console.error('USDC address is undefined for chain ID', currentChainId);
        return usdcBalance;
      }
      
      // Create a contract instance using the custom provider
      const usdcContract = new ethers.Contract(usdcAddress, USDC_ABI, customProvider);
      
      // Get decimals first
      const decimals = await usdcContract.decimals();
      console.log('USDC decimals:', decimals);
      
      // Get the balance directly using the contract instance
      const balanceRaw = await usdcContract.balanceOf(address);
      console.log('USDC raw balance:', balanceRaw.toString());
      
      // Format the balance with proper decimals
      const balance = ethers.formatUnits(balanceRaw, decimals);
      console.log('Updated USDC balance:', balance);
      setUsdcBalance(balance);
      return balance;
    } catch (err) {
      console.error('Error refreshing USDC balance:', err);
      return usdcBalance;
    }
  };
  
  // Function to ensure we're on Base network
  const ensureBaseNetwork = async () => {
    if (!connected || !providers?.ethereumProvider) {
      console.log('Cannot switch networks - not connected or no provider', { connected, hasProvider: !!providers?.ethereumProvider });
      return false;
    }
    
    try {
      // Using the proper Tomo SDK method to get chain ID
      const currentChainId = await providers.ethereumProvider.getChainId();
      console.log('Current chain ID:', currentChainId);
      const baseChainIdHex = `0x${BASE_CHAIN_ID.toString(16)}`;
      
      if (currentChainId !== baseChainIdHex && currentChainId !== BASE_CHAIN_ID) {
        console.log('Switching to Base network...');
        // Using the proper Tomo SDK method to switch chains
        await providers.ethereumProvider.switchChain(baseChainIdHex);
        return true;
      }
      
      console.log('Already on Base network');
      return true; // Already on Base
    } catch (err) {
      console.error('Error switching to Base network:', err);
      setError('Please switch to Base network manually.');
      return false;
    }
  };

  return (
    <Web3Context.Provider
      value={{
        connected,
        evmAddress,
        provider,
        signer,
        contracts,
        chainId,
        honorBalance,
        ethBalance,
        usdcBalance,
        refreshHonorBalance,
        refreshEthBalance,
        refreshUsdcBalance,
        ensureBaseNetwork,
        isLoading,
        error,
        initialized,
        isBaseNetwork: chainId === BASE_CHAIN_ID
      }}
    >
      {children}
    </Web3Context.Provider>
  );
};

export const useWeb3 = () => useContext(Web3Context);

export default Web3Context;
