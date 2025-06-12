import React, { useState, useEffect } from 'react';
import { useTomo, getWalletState } from '@tomo-inc/tomo-web-sdk';
import { ethers } from 'ethers';
import contractAddresses from '../contracts/addresses';

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

// Base network constants
const BASE_CHAIN_ID = 8453;

const BalanceDebugger = () => {
  const { connected, evmAddress, providers } = useTomo();
  const [ethBalance, setEthBalance] = useState('Loading...');
  const [usdcBalance, setUsdcBalance] = useState('Loading...');
  const [chainId, setChainId] = useState('Unknown');
  const [logs, setLogs] = useState([]);

  const addLog = (message) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const getChainId = async () => {
    try {
      addLog('Getting chain ID...');
      if (!providers?.ethereumProvider) {
        addLog('No Tomo provider available for getting chain ID');
        return null;
      }
      
      // Use the proper Tomo SDK method to get chain ID
      const chainIdValue = await providers.ethereumProvider.getChainId();
      const chainIdDecimal = typeof chainIdValue === 'string' && chainIdValue.startsWith('0x') 
        ? parseInt(chainIdValue, 16) 
        : Number(chainIdValue);
      addLog(`Chain ID from Tomo: ${chainIdDecimal} (${chainIdValue})`);
      setChainId(chainIdDecimal);
      return chainIdDecimal;
    } catch (error) {
      addLog(`Error getting chain ID: ${error.message}`);
      return null;
    }
  };


  
  const getEthBalance = async () => {
    if (!connected || !providers?.ethereumProvider) {
      addLog('Cannot get ETH balance - not connected or no provider');
      setEthBalance('Not connected');
      return;
    }

    try {
      // Get the address from wallet state for more reliability
      const address = getWalletState().address || evmAddress;
      if (!address) {
        addLog('No wallet address available');
        setEthBalance('No address');
        return;
      }
      
      addLog(`Getting ETH balance for Tomo address: ${address}...`);
      const balanceHex = await providers.ethereumProvider.request({
        method: 'eth_getBalance',
        params: [address, 'latest']
      });
      addLog(`ETH balance from Tomo provider: ${balanceHex}`);
      addLog(`Raw ETH balance: ${balanceHex}`);
      
      const balanceWei = ethers.toBigInt(balanceHex);
      const formattedBalance = ethers.formatEther(balanceWei);
      addLog(`Formatted ETH balance: ${formattedBalance}`);
      
      setEthBalance(formattedBalance);
    } catch (error) {
      addLog(`Error getting ETH balance: ${error.message}`);
      setEthBalance('Error');
    }
  };

  const getUsdcBalance = async () => {
    if (!connected || !providers?.ethereumProvider) {
      addLog('Cannot get USDC balance - not connected or no provider');
      setUsdcBalance('Not connected');
      return;
    }

    // Get the address from wallet state for more reliability
    const address = getWalletState().address || evmAddress;
    if (!address) {
      addLog('No wallet address available');
      setUsdcBalance('No address');
      return;
    }

    const currentChainId = await getChainId();
    if (!currentChainId || !contractAddresses[currentChainId]) {
      addLog(`No contract addresses for chain ID ${currentChainId}`);
      setUsdcBalance('Unsupported network');
      return;
    }

    try {
      const usdcAddress = contractAddresses[currentChainId].USDC_TOKEN;
      addLog(`Getting USDC balance from ${usdcAddress}...`);
      
      // Get decimals first
      const decimalsHex = await providers.ethereumProvider.request({
        method: 'eth_call',
        params: [{
          to: usdcAddress,
          data: '0x313ce567' // Function selector for 'decimals()'
        }, 'latest']
      });
      addLog(`USDC decimals from Tomo: ${decimalsHex}`);
      
      const decimals = parseInt(decimalsHex, 16);
      addLog(`USDC decimals: ${decimals}`);
      
      // Encode the balanceOf function call with the user's address
      const encodedAddress = address.slice(2).padStart(64, '0');
      const data = `0x70a08231000000000000000000000000${encodedAddress}`;
      
      // Call the USDC contract to get the balance
      const balanceHex = await providers.ethereumProvider.request({
        method: 'eth_call',
        params: [{
          to: usdcAddress,
          data: data
        }, 'latest']
      });
      addLog(`USDC balance from Tomo: ${balanceHex}`);
      
      addLog(`Raw USDC balance: ${balanceHex}`);
      
      // Convert hex balance to decimal
      const balanceRaw = ethers.toBigInt(balanceHex);
      const formattedBalance = ethers.formatUnits(balanceRaw, decimals);
      addLog(`Formatted USDC balance: ${formattedBalance}`);
      
      setUsdcBalance(formattedBalance);
    } catch (error) {
      addLog(`Error getting USDC balance: ${error.message}`);
      setUsdcBalance('Error');
    }
  };

  const refreshBalances = async () => {
    await getChainId();
    await getEthBalance();
    await getUsdcBalance();
  };

  const switchToBase = async () => {
    try {
      addLog('Switching to Base network...');
      if (!providers?.ethereumProvider) {
        addLog('No provider available for switching networks');
        return;
      }
      
      // Use the proper Tomo SDK method to switch chains
      await providers.ethereumProvider.switchChain('0x2105'); // Base Mainnet (8453)
      
      addLog('Successfully switched to Base network');
      await getChainId();
      await getEthBalance();
      await getUsdcBalance();
    } catch (error) {
      addLog(`Error switching to Base: ${error.message}`);
    }
  };
  
  useEffect(() => {
    if (connected && evmAddress) {
      addLog('Connected to wallet with address: ' + evmAddress);
      refreshBalances();
    } else {
      addLog('Not connected to wallet or no address');
      setEthBalance('Not connected');
      setUsdcBalance('Not connected');
    }
  }, [connected, evmAddress]);

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h2>Balance Debugger</h2>
      
      <div style={{ marginBottom: '20px' }}>
        <h3>Connection Status</h3>
        <p>Connected: {connected ? 'Yes' : 'No'}</p>
        <p>Address: {evmAddress || 'Not connected'}</p>
        <p>Chain ID: {chainId}</p>
      </div>
      
      <div style={{ marginBottom: '20px' }}>
        <h3>Balances</h3>
        <p>ETH Balance: {ethBalance}</p>
        <p>USDC Balance: {usdcBalance}</p>
        <div style={{ marginTop: '10px' }}>
          <button onClick={refreshBalances} disabled={!connected}>Refresh All Balances</button>
          <button onClick={switchToBase} disabled={!connected} style={{ marginLeft: '10px' }}>Switch to Base Network</button>
          <button onClick={getEthBalance} disabled={!connected} style={{ marginLeft: '10px' }}>Refresh ETH Balance</button>
          <button onClick={getUsdcBalance} disabled={!connected} style={{ marginLeft: '10px' }}>Refresh USDC Balance</button>
        </div>
      </div>
      
      <div>
        <h3>Debug Logs</h3>
        <div style={{ 
          height: '300px', 
          overflowY: 'scroll', 
          border: '1px solid #ccc', 
          padding: '10px',
          backgroundColor: '#f5f5f5',
          fontFamily: 'monospace'
        }}>
          {logs.map((log, index) => (
            <div key={index}>{log}</div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BalanceDebugger;
