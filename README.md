# Honor Roll

A decentralized platform for AI-generated video content with community voting and yield-generating staking rewards.

## Overview

Honor Roll is a platform that combines AI video generation with a decentralized voting and rewards system. Users can purchase Honor tokens with USDC, which can then be used to create AI-generated videos or stake on voting choices. The platform generates yield for voters who back choices, creating an engaging ecosystem for content creation and curation.

## Key Features

### Video Generation
- AI-powered vertical video generation based on user prompts (costs 20 Honor per video)
- Two-choice format for each video to enable community voting
- Integration with existing backend for video generation

### Voting & Staking System
- Users stake Honor tokens to vote on video choices
- Voting power is proportional to stake amount
- Yield generated for voters based on their staked Honor
- Royalties provided to content creators

### Web3 Integration
- Authentication via Tomo for seamless web3 login
- DeBridge integration to connect Story Protocol to DeFi yield sources (Aave on Base)
- IP protection and monetization through Story Protocol

## Technical Architecture

### Frontend
- Modern React-based web application with playful cartoon-style UI
- Three main tabs:
  - Create: Text input for prompts and video generation (20 Honor per video)
  - Vote: Display videos with choices and staking interface
  - Buy Honor: Purchase Honor tokens with USDC

### Backend Integration
- Connection to existing AI video generation backend
- API endpoints for video creation, retrieval, and voting

### Blockchain Integration
- **Tomo**: Web3 social wallet for authentication and user management
- **DeBridge**: Cross-chain interoperability for connecting to DeFi yield sources
- **Honor Token**: Platform currency purchased with USDC, used for video creation and voting
- **Story Protocol**: IP registration and royalty management for content creators
- **Aave on Base**: DeFi yield source for staking rewards

## Development Roadmap

### Phase 1: Core Platform
- Set up frontend application structure
- Implement authentication with Tomo
- Connect to existing video generation backend
- Create basic UI for prompt input and video display

### Phase 2: Voting & Staking
- Implement voting interface
- Connect DeBridge for cross-chain asset transfers
- Set up staking mechanism
- Create reward distribution system

### Phase 3: IP & Rewards
- Integrate Story Protocol for IP registration
- Implement royalty system for creators
- Connect to Aave on Base for yield generation
- Finalize reward distribution mechanisms

## Getting Started

### Prerequisites
- Node.js (v16+)
- npm or yarn
- Tomo wallet (https://tomo.inc)

### Installation
```bash
# Clone the repository
git clone https://github.com/madschristensen99/honorRoll.git

# Install dependencies
cd honorRoll
npm install

# Start development server
npm start
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
