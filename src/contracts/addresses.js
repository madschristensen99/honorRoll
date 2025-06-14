/**
 * Contract addresses for Honor Roll smart contracts
 * Hardcoded from deployment configuration
 */

// Hardcoded deployment addresses based on memory

// Format addresses for use in the frontend
const contractAddresses = {
  // Base Mainnet
  8453: {
    HONOR_TOKEN: '0xb23a6DE2030A6B5C28853457484Ac069a6390F0B',
    VIDEO_MANAGER: '0x6783f7C740B90B50477B9C9E985E633E98C28267',
    VOTING_MANAGER: '0xDCca32B20F0F99FF61EE411552f47E707FE9C797',
    USDC_MANAGER: '0x7bcF5F9180858437b6008F26757bA70baD963b54',
    YIELD_MANAGER: '0x2832b2C69849Da7b8593698c7339359c40527292',
    CROSS_CHAIN_BRIDGE: '0xE625cf71d3d1DED720a29685bdCF47C2C63075bD',
    USDC_TOKEN: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base USDC
  },
  // Base Sepolia (testnet)
  84532: {
    HONOR_TOKEN: '',
    VIDEO_MANAGER: '',
    VOTING_MANAGER: '',
    USDC_MANAGER: '',
    YIELD_MANAGER: '',
    CROSS_CHAIN_BRIDGE: '',
    USDC_TOKEN: '', // Base Sepolia USDC
  }
};

export default contractAddresses;
