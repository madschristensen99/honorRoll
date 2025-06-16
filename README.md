# ✨ Honor Roll 🎬

A decentralized platform for AI-generated video content with community voting for Aave yield generated rewards. 🚀🎥💰
 

## 🌟 Overview

Honor Roll is a platform that combines AI video generation with a decentralized voting and rewards system. Users can purchase Honor tokens with USDC, which can then be used to create AI-generated videos or vote on choices. The platform generates yield for voters who back winning choices, creating an engaging ecosystem for content creation and curation.

## 🔑 Key Features

### 🎥 Video Generation
- AI-powered vertical video generation based on user prompts (costs 20 Honor per video)
- Two-choice format for each video to enable community voting
- Integration with existing backend for video generation

### 🗳️ Voting & Rewards System
- Users vote with their Honor token balance (tokens are NOT consumed when voting)
- Voting power is proportional to Honor balance
- Yield generated for voters who back winning choices
- Royalties provided to content creators when sequels are made

### 🌐 Web3 Integration
- Authentication via Tomo for seamless web3 login
- DeBridge integration to connect Story Protocol to DeFi yield sources (Aave on Base)
- IP protection and monetization through Story Protocol

## 🏗️ Technical Architecture

### 💻 Frontend
- Modern React-based web application with playful cartoon-style UI
- Three main tabs:
  - Create: Text input for prompts and video generation (20 Honor per video)
  - Vote: Display videos with choices and voting interface
  - Buy Honor: Purchase Honor tokens with USDC

### 🔄 Backend Integration
- Connection to existing AI video generation backend
- Blockchain event listener for processing video creation and voting events
- Automated video generation and Livepeer upload pipeline

### ⛓️ Blockchain Integration
- **Tomo**: Web3 social wallet for authentication and user management
- **DeBridge**: Cross-chain interoperability for connecting to DeFi yield sources
- **Honor Token**: Platform currency purchased with USDC, used for video creation and voting
- **Story Protocol**: IP registration and royalty management for content creators
- **Aave on Base**: DeFi yield source for voting rewards

### 📝 Smart Contract Architecture

#### 🔮 Core Contracts

1. **HonorToken** ([0x5770ba6ecb8C1400bCBcff1D673DEb1B7CED1b83](https://basescan.org/address/0x5770ba6ecb8C1400bCBcff1D673DEb1B7CED1b83))
   - ERC-20 token with 6 decimals (matching USDC)
   - 1:1 exchange rate with USDC
   - Minted when users purchase with USDC
   - Burned only when creating videos (20 HONOR per video)
   - Role-based access control for minting/burning

2. **USDCManager** ([0xb00e57F0Fe5B29376Ce4042B9a5596Ca1E5A00b3](https://basescan.org/address/0xb00e57F0Fe5B29376Ce4042B9a5596Ca1E5A00b3))
   - Handles USDC deposits from users
   - Deposits USDC into Aave to generate yield
   - Withdraws USDC when videos are created
   - Tracks total value locked in Aave

3. **VideoManager** ([0xDF8626Ffb23C8a92A7b906345E7aE756BABD02F4](https://basescan.org/address/0xDF8626Ffb23C8a92A7b906345E7aE756BABD02F4))
   - Manages video creation (original and sequels)
   - Burns 20 HONOR when creating videos
   - For original videos: sends 20 USDC to operator
   - For sequels: sends 19 USDC to operator, 1 USDC shared among previous creators
   - Maintains linked list data structure for video sequences
   - Registers videos as IP Assets on Story Protocol

4. **VotingManager** ([0x6329572dd5FB47Bc67AaEA5403B86Aa1E6c07A3C](https://basescan.org/address/0x6329572dd5FB47Bc67AaEA5403B86Aa1E6c07A3C))
   - Manages 24-hour voting periods for videos
   - Uses HONOR balance as voting weight (tokens not consumed)
   - Tracks votes and determines winning choices
   - Distributes yield rewards to winning voters

5. **YieldManager** ([0x2bE0Fde9dBE315b45d35be09AF0aD97C8CaEF4F9](https://basescan.org/address/0x2bE0Fde9dBE315b45d35be09AF0aD97C8CaEF4F9))
   - Collects yield generated from USDC in Aave
   - Distributes yield: 20% to creators, 80% to winning voters
   - Calculates rewards proportional to voting weight

6. **CrossChainBridge** ([0x7286377efE9a4772DC94fC9FCEE3B41eB566D95b](https://basescan.org/address/0x7286377efE9a4772DC94fC9FCEE3B41eB566D95b))
   - Facilitates communication between Base and Story Protocol chains
   - Uses deBridge for trustless message passing
   - Handles IP registration, royalty updates, and ownership syncing

7. **USDC Token** ([0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913](https://basescan.org/address/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913))
   - Base network's native USDC token
   - Used for purchasing HONOR tokens
   - Deposited into Aave for yield generation

#### 💸 Cash Flow

1. **USDC to HONOR**: Users deposit USDC (1:1 ratio to HONOR)
   - USDC goes to Aave for yield generation
   - Equivalent HONOR minted to user

2. **Video Creation**: Users spend 20 HONOR to create videos
   - HONOR is burned
   - 20 USDC withdrawn from Aave
   - For original videos: 20 USDC to operator
   - For sequels: 19 USDC to operator, 1 USDC shared among previous creators

3. **Voting**: Users vote with their HONOR balance
   - HONOR is NOT consumed when voting
   - Voting weight equals HONOR balance

4. **Rewards**: When a sequel is created
   - Yield from Aave is distributed
   - 20% to previous creators in the sequence
   - 80% to voters who backed winning choice of previous video
   - Distribution proportional to HONOR balance



## 🚀 Getting Started

### 📋 Prerequisites
- Node.js (v16+)
- npm or yarn
- Tomo wallet (https://tomo.inc)

### 🔧 Installation
```bash
# Clone the repository
git clone https://github.com/madschristensen99/honorRoll.git

# Install dependencies
cd honorRoll
npm install --legacy-peer-deps

# Start development server
npm start
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

### 🌟 Special Thanks

Jacob from Story Protocol rules! 🙌
