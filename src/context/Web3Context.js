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

// Hardcoded fallback addresses for Base Mainnet (chain ID 8453)
// These are used if the addresses from the addresses.js file are not available
const BASE_MAINNET_HONOR_TOKEN_ADDRESS = '0xb23a6DE2030A6B5C28853457484Ac069a6390F0B';
const BASE_MAINNET_VIDEO_MANAGER_ADDRESS = '0x6783f7C740B90B50477B9C9E985E633E98C28267';
const BASE_MAINNET_VOTING_MANAGER_ADDRESS = '0xDCca32B20F0F99FF61EE411552f47E707FE9C797';
const BASE_MAINNET_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const BASE_MAINNET_USDC_MANAGER_ADDRESS = '0x7bcF5F9180858437b6008F26757bA70baD963b54';
const BASE_MAINNET_YIELD_MANAGER_ADDRESS = '0x2832b2C69849Da7b8593698c7339359c40527292';
const BASE_MAINNET_CROSS_CHAIN_BRIDGE_ADDRESS = '0xE625cf71d3d1DED720a29685bdCF47C2C63075bD';

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
    if (connected && providers?.ethereumProvider) {
      const switchToBase = async () => {
        try {
          console.log('Web3Context: Checking current network...');
          
          // Check current chain ID
          const chainIdValue = await providers.ethereumProvider.request({
            method: 'eth_chainId'
          });
          
          const currentChainId = typeof chainIdValue === 'string' && chainIdValue.startsWith('0x') 
            ? parseInt(chainIdValue, 16) 
            : Number(chainIdValue);
          
          console.log('Web3Context: Current chain ID:', currentChainId);
          setChainId(currentChainId);
          
          // If not on Base, try to switch
          if (currentChainId !== BASE_CHAIN_ID) {
            console.log('Web3Context: Not on Base network, attempting to switch...');
            setError(`Please switch to the Base network (Chain ID: ${BASE_CHAIN_ID})`);
            
            try {
              // Try to switch to Base using the hex chain ID format
              const baseChainIdHex = `0x${BASE_CHAIN_ID.toString(16)}`;
              console.log('Web3Context: Switching to chain ID:', baseChainIdHex);
              
              await providers.ethereumProvider.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: baseChainIdHex }]
              });
              
              console.log('Web3Context: Successfully switched to Base network');
              setError(null);
              
              // Re-initialize contracts after network switch
              setTimeout(() => {
                // Trigger re-initialization by updating the chainId state
                setChainId(BASE_CHAIN_ID);
              }, 1000);
              
            } catch (switchError) {
              // This error code indicates that the chain has not been added to MetaMask
              if (switchError.code === 4902) {
                console.log('Web3Context: Base network not found, attempting to add it...');
                
                try {
                  await providers.ethereumProvider.request({
                    method: 'wallet_addEthereumChain',
                    params: [
                      {
                        chainId: `0x${BASE_CHAIN_ID.toString(16)}`,
                        chainName: BASE_NETWORK_NAME,
                        nativeCurrency: {
                          name: 'Ethereum',
                          symbol: 'ETH',
                          decimals: 18
                        },
                        rpcUrls: ['https://mainnet.base.org'],
                        blockExplorerUrls: ['https://basescan.org']
                      }
                    ]
                  });
                  
                  console.log('Web3Context: Successfully added Base network');
                  setError(null);
                  
                  // Re-initialize contracts after adding network
                  setTimeout(() => {
                    // Trigger re-initialization by updating the chainId state
                    setChainId(BASE_CHAIN_ID);
                  }, 1000);
                  
                } catch (addError) {
                  console.error('Web3Context: Error adding Base network:', addError);
                  setError('Failed to add Base network. Please add it manually in your wallet.');
                }
              } else {
                console.error('Web3Context: Error switching to Base network:', switchError);
                setError('Failed to switch to Base network. Please switch manually in your wallet.');
              }
            }
          } else {
            console.log('Web3Context: Already on Base network');
            setError(null);
          }
        } catch (error) {
          console.error('Web3Context: Error in network switching:', error);
          setError('Error checking network. Please ensure your wallet is connected.');
        }
      };
      
      switchToBase();
    }
  }, [connected, providers]);

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
        
        // Get wallet address from Tomo SDK
        console.log('Web3Context: Getting wallet address...');
        let walletAddress;
        
        try {
          // Try to get accounts directly from the provider - this is the approach that works in BuyHonors
          console.log('Web3Context: Requesting accounts from provider...');
          const accounts = await providers.ethereumProvider.request({
            method: 'eth_requestAccounts'
          });
          
          if (accounts && accounts.length > 0) {
            walletAddress = accounts[0];
            console.log('Web3Context: Got wallet address from eth_requestAccounts:', walletAddress);
          } else {
            console.warn('Web3Context: No accounts returned from eth_requestAccounts');
          }
        } catch (error) {
          console.error('Web3Context: Error getting accounts from provider:', error);
        }
        
        // If we still don't have an address, try evmAddress
        if (!walletAddress && evmAddress) {
          walletAddress = evmAddress;
          console.log('Web3Context: Using evmAddress as fallback:', walletAddress);
        }
        
        // As a last resort, try getWalletState
        if (!walletAddress) {
          try {
            console.log('Web3Context: Trying getWalletState as last resort...');
            const walletState = await getWalletState();
            walletAddress = walletState?.address;
            console.log('Web3Context: Got wallet address from getWalletState:', walletAddress);
          } catch (stateError) {
            console.error('Web3Context: Error getting wallet state:', stateError);
          }
        }
        
        if (!walletAddress) {
          console.error('Web3Context: Could not get wallet address');
          setError('Could not get wallet address. Please reconnect your wallet.');
          setIsLoading(false);
          return;
        }
        
        console.log('Web3Context: Final wallet address:', walletAddress);
        
        // Get chain ID from Tomo provider
        console.log('Web3Context: Getting chain ID from Tomo provider...');
        const chainIdValue = await providers.ethereumProvider.getChainId();
        let currentChainId = typeof chainIdValue === 'string' && chainIdValue.startsWith('0x') 
          ? parseInt(chainIdValue, 16) 
          : Number(chainIdValue);
        console.log('Web3Context: Connected to network with chain ID:', currentChainId);
        setChainId(currentChainId);
        
        // Set target chain ID - Base Mainnet is 8453
        const targetChainId = BASE_CHAIN_ID;
        
        // Check if we're on the correct network
        if (currentChainId !== targetChainId) {
          console.warn(`Web3Context: Not on Base Mainnet. Current chain ID: ${currentChainId}, Target: ${targetChainId}`);
          setError(`Please switch to the Base network (Chain ID: ${targetChainId})`);
          
          // We'll continue with Base Mainnet addresses as fallback
          console.log('Web3Context: Using Base Mainnet addresses as fallback');
          currentChainId = targetChainId;
        }
        
        // Check if we have addresses for this chain
        if (!contractAddresses[currentChainId]) {
          console.log('Web3Context: Unsupported network', { chainId: currentChainId, availableChains: Object.keys(contractAddresses) });
          console.warn(`Unsupported network: Chain ID ${currentChainId}. Using Base Mainnet addresses as fallback.`);
          // Use Base Mainnet (8453) as fallback
          currentChainId = BASE_CHAIN_ID;
        }
        console.log('Web3Context: Found contract addresses for chain', currentChainId);
        
        // Get addresses for the current chain or use hardcoded fallbacks
        const contractAddressesForChain = contractAddresses[currentChainId] || {};
        
        // Use addresses from config or fallback to hardcoded addresses
        const honorTokenAddress = contractAddressesForChain.HONOR_TOKEN || BASE_MAINNET_HONOR_TOKEN_ADDRESS;
        const videoManagerAddress = contractAddressesForChain.VIDEO_MANAGER || BASE_MAINNET_VIDEO_MANAGER_ADDRESS;
        const votingManagerAddress = contractAddressesForChain.VOTING_MANAGER || BASE_MAINNET_VOTING_MANAGER_ADDRESS;
        const usdcManagerAddress = contractAddressesForChain.USDC_MANAGER || BASE_MAINNET_USDC_MANAGER_ADDRESS;
        const yieldManagerAddress = contractAddressesForChain.YIELD_MANAGER || BASE_MAINNET_YIELD_MANAGER_ADDRESS;
        const crossChainBridgeAddress = contractAddressesForChain.CROSS_CHAIN_BRIDGE || BASE_MAINNET_CROSS_CHAIN_BRIDGE_ADDRESS;
        const usdcTokenAddress = contractAddressesForChain.USDC_TOKEN || BASE_MAINNET_USDC_ADDRESS;
        
        console.log('Web3Context: Using contract addresses:', {
          honorToken: honorTokenAddress,
          videoManager: videoManagerAddress,
          votingManager: votingManagerAddress,
          usdcManager: usdcManagerAddress,
          yieldManager: yieldManagerAddress,
          crossChainBridge: crossChainBridgeAddress,
          usdcToken: usdcTokenAddress
        });
        
        // Create ethers provider and signer for contract interactions
        console.log('Web3Context: Creating ethers provider and signer...');
        let ethersProvider;
        let ethSigner;
        let signerAddress;
        
        try {
          // We need to use the Tomo provider's underlying provider for ethers
          ethersProvider = new ethers.BrowserProvider(providers.ethereumProvider);
          ethSigner = await ethersProvider.getSigner();
          setSigner(ethSigner);
          signerAddress = await ethSigner.getAddress();
          console.log('Web3Context: Got signer', { address: signerAddress });
          
          // Verify wallet address matches signer address
          if (walletAddress.toLowerCase() !== signerAddress.toLowerCase()) {
            console.warn('Web3Context: Wallet address does not match signer address', { walletAddress, signerAddress });
            // Use the signer address as the wallet address since that's what will be used for transactions
            walletAddress = signerAddress;
          }
        } catch (signerError) {
          console.error('Web3Context: Error getting signer:', signerError);
          setError('Error getting signer. Please check your wallet connection.');
          setIsLoading(false);
          return;
        }
        
        // Initialize contract instances
        console.log('Web3Context: Initializing contract instances...');
        
        try {
          console.log('Web3Context: Creating contract instances with addresses');
          
          // Use a try-catch for each contract to prevent one failure from breaking everything
          const contractInstances = {};
          
          // Create each contract instance in a separate try-catch
          try {
            contractInstances.honorToken = new ethers.Contract(honorTokenAddress, HonorTokenABI, ethSigner);
            console.log('Web3Context: Created HonorToken contract at', contractInstances.honorToken.target);
          } catch (err) {
            console.error('Web3Context: Failed to create HonorToken contract:', err);
          }
          
          try {
            contractInstances.videoManager = new ethers.Contract(videoManagerAddress, VideoManagerABI, ethSigner);
            console.log('Web3Context: Created VideoManager contract at', contractInstances.videoManager.target);
          } catch (err) {
            console.error('Web3Context: Failed to create VideoManager contract:', err);
          }
          
          try {
            contractInstances.votingManager = new ethers.Contract(votingManagerAddress, VotingManagerABI, ethSigner);
            console.log('Web3Context: Created VotingManager contract at', contractInstances.votingManager.target);
          } catch (err) {
            console.error('Web3Context: Failed to create VotingManager contract:', err);
          }
          
          try {
            contractInstances.usdcManager = new ethers.Contract(usdcManagerAddress, USDCManagerABI, ethSigner);
            console.log('Web3Context: Created USDCManager contract at', contractInstances.usdcManager.target);
          } catch (err) {
            console.error('Web3Context: Failed to create USDCManager contract:', err);
          }
          
          try {
            contractInstances.yieldManager = new ethers.Contract(yieldManagerAddress, YieldManagerABI, ethSigner);
            console.log('Web3Context: Created YieldManager contract at', contractInstances.yieldManager.target);
          } catch (err) {
            console.error('Web3Context: Failed to create YieldManager contract:', err);
          }
          
          try {
            contractInstances.crossChainBridge = new ethers.Contract(crossChainBridgeAddress, CrossChainBridgeABI, ethSigner);
            console.log('Web3Context: Created CrossChainBridge contract at', contractInstances.crossChainBridge.target);
          } catch (err) {
            console.error('Web3Context: Failed to create CrossChainBridge contract:', err);
          }
          
          // Check if we have at least some of the critical contracts
          const hasHonorToken = contractInstances.honorToken && contractInstances.honorToken.target;
          const hasUsdcManager = contractInstances.usdcManager && contractInstances.usdcManager.target;
          
          if (hasHonorToken && hasUsdcManager) {
            console.log('Web3Context: Critical contracts initialized successfully');
            setInitialized(true);
            setError(null); // Clear any previous errors
          } else {
            console.warn('Web3Context: Some critical contracts failed to initialize', {
              hasHonorToken,
              hasUsdcManager
            });
            
            // Set error message but still try to use what we have
            setError('Some contracts failed to initialize. Some features may not work properly.');
            setInitialized(true); // Still allow the app to function with what we have
          }
          
          // Log contract instances for debugging
          console.log('Web3Context: Contract instances initialized');
          
          setContracts(contractInstances);
          
          // Fetch initial balances - do this in a separate try/catch to avoid breaking initialization
          setTimeout(async () => {
            try {
              console.log('Web3Context: Fetching initial balances...');
              
              // Fetch ETH balance first - this is the most reliable
              try {
                await refreshEthBalance();
              } catch (ethErr) {
                console.error('Web3Context: Error fetching ETH balance:', ethErr);
              }
              
              // Fetch HONOR balance
              try {
                await refreshHonorBalance();
              } catch (honorErr) {
                console.error('Web3Context: Error fetching HONOR balance:', honorErr);
              }
              
              // Fetch USDC balance
              try {
                await refreshUsdcBalance();
              } catch (usdcErr) {
                console.error('Web3Context: Error fetching USDC balance:', usdcErr);
              }
              
              console.log('Web3Context: Initial balance fetching completed');
            } catch (err) {
              console.error('Web3Context: Error in initial balance fetching:', err);
              // Don't set error here, just log it - we don't want to block the UI for balance issues
            }
          }, 500); // Small delay to ensure contracts are fully initialized
          
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
  }, [provider, connected, evmAddress, providers, chainId]);
  
  // Update honor balance when contracts or wallet address changes
  useEffect(() => {
    const updateBalance = async () => {
      if (!contracts.honorToken || !signer) return;
      
      try {
        // Get the current wallet address from the signer
        const currentAddress = await signer.getAddress();
        console.log('Web3Context: Fetching HONOR balance for address:', currentAddress);
        
        const balance = await contracts.honorToken.balanceOf(currentAddress);
        const formattedBalance = ethers.formatUnits(balance, 6); // Honor token has 6 decimals
        console.log('Web3Context: HONOR balance =', formattedBalance);
        setHonorBalance(formattedBalance);
      } catch (err) {
        console.error('Web3Context: Error fetching HONOR balance:', err);
      }
    };
    
    updateBalance();
  }, [contracts.honorToken, signer]);
  
  // Function to refresh honor balance using custom RPC URL
  const refreshHonorBalance = async () => {
    if (!connected) {
      console.log('Web3Context: Cannot refresh Honor balance - not connected');
      return;
    }
    
    try {
      // Get wallet address from signer if available
      let address;
      
      if (signer) {
        try {
          address = await signer.getAddress();
          console.log('Web3Context: Using signer address for Honor balance refresh:', address);
        } catch (error) {
          console.error('Web3Context: Error getting address from signer:', error);
        }
      }
      
      // If we couldn't get the address from signer, try the Tomo SDK approach
      if (!address) {
        try {
          // Try to get accounts directly from the provider - this is the approach that works in BuyHonors
          const accounts = await providers.ethereumProvider.request({
            method: 'eth_requestAccounts'
          });
          
          if (accounts && accounts.length > 0) {
            address = accounts[0];
            console.log('Web3Context: Got wallet address from eth_requestAccounts for balance refresh:', address);
          }
        } catch (error) {
          console.error('Web3Context: Error getting accounts from provider:', error);
        }
      }
      
      // If we still don't have an address, try one more approach
      if (!address) {
        try {
          const walletState = await getWalletState();
          address = walletState?.address;
          console.log('Web3Context: Got wallet address from getWalletState for balance refresh:', address);
        } catch (error) {
          console.error('Web3Context: Error getting wallet state:', error);
        }
      }
      
      if (!address) {
        console.log('Web3Context: Cannot refresh Honor balance - no wallet address');
        return;
      }
      
      // Create a direct provider using our custom RPC URL
      console.log('Web3Context: Getting chain ID using custom RPC URL:', CUSTOM_RPC_URL);
      const customProvider = new ethers.JsonRpcProvider(CUSTOM_RPC_URL);
      const network = await customProvider.getNetwork();
      const currentChainId = Number(network.chainId);
      console.log('Web3Context: Chain ID from custom provider:', currentChainId);
      
      // Use our hardcoded address if needed
      const honorTokenAddress = contractAddresses[currentChainId]?.HONOR_TOKEN || BASE_MAINNET_HONOR_TOKEN_ADDRESS;
      console.log('Honor token address:', honorTokenAddress);
      
      if (!honorTokenAddress) {
        console.error('Honor token address is undefined for chain ID', currentChainId);
        return honorBalance;
      }
      
      // Create a contract instance using the custom provider
      const honorTokenContract = new ethers.Contract(honorTokenAddress, HonorTokenABI, customProvider);
      
      // Get the balance directly using the contract instance
      const balanceRaw = await honorTokenContract.balanceOf(address);
      console.log('Honor raw balance:', balanceRaw.toString());
      
      // Honor token has 6 decimals (based on raw balance 20260000 showing as 20.26)
      const balance = ethers.formatUnits(balanceRaw, 6);
      console.log('Updated Honor balance:', balance);
      setHonorBalance(balance);
      return balance;
    } catch (err) {
      console.error('Error refreshing Honor balance:', err);
      return honorBalance;
    }
  };

  // Function to refresh ETH balance using Tomo provider directly
  const refreshEthBalance = async () => {
    if (!connected || !providers?.ethereumProvider) {
      console.log('Web3Context: Cannot refresh ETH balance - not connected or no provider');
      return;
    }
    
    try {
      // Get wallet address using the approach that works in BuyHonors
      let address;
      
      // First try to get address from signer if available
      if (signer) {
        try {
          address = await signer.getAddress();
          console.log('Web3Context: Using signer address for ETH balance refresh:', address);
        } catch (error) {
          console.error('Web3Context: Error getting address from signer:', error);
        }
      }
      
      // If we couldn't get the address from signer, try the Tomo SDK approach
      if (!address) {
        try {
          // Try to get accounts directly from the provider - this is the approach that works in BuyHonors
          const accounts = await providers.ethereumProvider.request({
            method: 'eth_requestAccounts'
          });
          
          if (accounts && accounts.length > 0) {
            address = accounts[0];
            console.log('Web3Context: Got wallet address from eth_requestAccounts for ETH balance:', address);
          }
        } catch (error) {
          console.error('Web3Context: Error getting accounts from provider:', error);
        }
      }
      
      if (!address) {
        console.log('Web3Context: Cannot refresh ETH balance - no wallet address');
        return;
      }
      
      // Use the Tomo provider's request method to get the balance
      const ethBalanceHex = await providers.ethereumProvider.request({
        method: 'eth_getBalance',
        params: [address, 'latest']
      });
      
      // Convert hex balance to decimal
      const ethBalanceWei = ethers.toBigInt(ethBalanceHex);
      const formattedEthBalance = ethers.formatEther(ethBalanceWei);
      console.log('Web3Context: Updated ETH balance =', formattedEthBalance);
      setEthBalance(formattedEthBalance);
      return formattedEthBalance;
    } catch (err) {
      console.error('Web3Context: Error refreshing ETH balance:', err);
      return ethBalance;
    }
  };
  
  // Function to refresh USDC balance using custom RPC URL
  const refreshUsdcBalance = async () => {
    if (!connected) {
      console.log('Web3Context: Cannot refresh USDC balance - not connected');
      return;
    }
    
    try {
      // Get wallet address using the approach that works in BuyHonors
      let address;
      
      // First try to get address from signer if available
      if (signer) {
        try {
          address = await signer.getAddress();
          console.log('Web3Context: Using signer address for USDC balance refresh:', address);
        } catch (error) {
          console.error('Web3Context: Error getting address from signer:', error);
        }
      }
      
      // If we couldn't get the address from signer, try the Tomo SDK approach
      if (!address) {
        try {
          // Try to get accounts directly from the provider - this is the approach that works in BuyHonors
          const accounts = await providers.ethereumProvider.request({
            method: 'eth_requestAccounts'
          });
          
          if (accounts && accounts.length > 0) {
            address = accounts[0];
            console.log('Web3Context: Got wallet address from eth_requestAccounts for USDC balance:', address);
          }
        } catch (error) {
          console.error('Web3Context: Error getting accounts from provider:', error);
        }
      }
      
      // Create a direct provider using our custom RPC URL
      console.log('Web3Context: Getting chain ID using custom RPC URL:', CUSTOM_RPC_URL);
      const customProvider = new ethers.JsonRpcProvider(CUSTOM_RPC_URL);
      const network = await customProvider.getNetwork();
      const currentChainId = Number(network.chainId);
      console.log('Web3Context: Chain ID from custom provider:', currentChainId);
      setChainId(currentChainId); // Update the chainId state
      
      // Use our hardcoded address if needed
      console.log('Web3Context: Refreshing USDC balance for address:', address);
      
      // Debug the contract addresses
      console.log('Web3Context: Contract addresses from config:', contractAddresses);
      console.log('Web3Context: Current chain ID:', currentChainId);
      console.log('Web3Context: USDC_TOKEN from config:', contractAddresses[currentChainId]?.USDC_TOKEN);
      console.log('Web3Context: Hardcoded USDC address:', BASE_MAINNET_USDC_ADDRESS);
      
      // Make sure we have a valid USDC address
      let usdcAddress = null;
      if (contractAddresses[currentChainId]?.USDC_TOKEN) {
        usdcAddress = contractAddresses[currentChainId].USDC_TOKEN;
        console.log('Web3Context: Using USDC address from config:', usdcAddress);
      } else if (BASE_MAINNET_USDC_ADDRESS) {
        usdcAddress = BASE_MAINNET_USDC_ADDRESS;
        console.log('Web3Context: Using hardcoded USDC address:', usdcAddress);
      } else {
        console.error('Web3Context: No valid USDC address available');
        return usdcBalance;
      }
      
      // Verify the address is valid
      if (!usdcAddress || usdcAddress === '0x0000000000000000000000000000000000000000' || usdcAddress === '') {
        console.error('Web3Context: Invalid USDC address:', usdcAddress);
        return usdcBalance;
      }
      
      try {
        // Create a contract instance using the custom provider
        console.log('Web3Context: Creating USDC contract with address:', usdcAddress);
        const usdcContract = new ethers.Contract(usdcAddress, USDC_ABI, customProvider);
        
        try {
          // Get decimals first
          const decimals = await usdcContract.decimals();
          console.log('Web3Context: USDC decimals:', decimals);
          
          // Get the balance directly using the contract instance
          const balanceRaw = await usdcContract.balanceOf(address);
          console.log('Web3Context: USDC raw balance:', balanceRaw.toString());
          
          // Format the balance with proper decimals
          const balance = ethers.formatUnits(balanceRaw, decimals);
          console.log('Web3Context: Updated USDC balance:', balance);
          setUsdcBalance(balance);
          return balance;
        } catch (contractError) {
          console.error('Web3Context: Error calling USDC contract methods:', contractError);
          
          // Try with default 6 decimals as fallback
          try {
            const balanceRaw = await usdcContract.balanceOf(address);
            const balance = ethers.formatUnits(balanceRaw, 6); // USDC typically has 6 decimals
            console.log('Web3Context: USDC balance (using fallback decimals):', balance);
            setUsdcBalance(balance);
            return balance;
          } catch (fallbackError) {
            console.error('Web3Context: Error in USDC balance fallback:', fallbackError);
            return usdcBalance;
          }
        }
      } catch (contractCreationError) {
        console.error('Web3Context: Error creating USDC contract:', contractCreationError);
        return usdcBalance;
      }
    } catch (err) {
      console.error('Web3Context: Error refreshing USDC balance:', err);
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
