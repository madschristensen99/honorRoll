const express = require('express');
const { Web3 } = require('web3');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const https = require('https');
const fs = require('fs');
require('dotenv').config();

const app = express();
const port = 3000;

// Initialize Web3
const web3 = new Web3('https://sepolia.base.org');

// Set up the faucet wallet
const privateKey = process.env.FAUCET_PRIVATE_KEY;
const privateKeyWithPrefix = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
let faucetWallet;
try {
  faucetWallet = web3.eth.accounts.privateKeyToAccount(privateKeyWithPrefix);
  console.log('Wallet created successfully');
  console.log('Wallet address:', faucetWallet.address);
} catch (error) {
  console.error('Error creating wallet:', error.message);
  process.exit(1);
}

// Middleware
app.use(express.json());

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || origin === 'https://claircent.com' || origin.endsWith('.claircent.com')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Faucet endpoint
app.post('/request-funds', async (req, res) => {
  const { address } = req.body;
  if (!web3.utils.isAddress(address)) {
    return res.status(400).json({ error: 'Invalid address' });
  }
  try {
    const gasPrice = await web3.eth.getGasPrice();
    const tx = {
      from: faucetWallet.address,
      to: address,
      value: web3.utils.toWei('0.01', 'ether'), // Adjust the amount as needed
      gas: 21000,
      gasPrice: gasPrice
    };
    const signedTx = await faucetWallet.signTransaction(tx);
    const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    res.json({ success: true, txHash: receipt.transactionHash });
  } catch (error) {
    console.error('Transaction error:', error);
    res.status(500).json({ error: 'Transaction failed', details: error.message });
  }
});

// HTTPS options
const httpsOptions = {
  key: fs.readFileSync('/etc/ssl/private/selfsigned.key'),
  cert: fs.readFileSync('/etc/ssl/certs/selfsigned.crt')
};

// Start the HTTPS server
https.createServer(httpsOptions, app).listen(port, '0.0.0.0', () => {
  console.log(`Faucet backend running on https://0.0.0.0:${port}`);
});
