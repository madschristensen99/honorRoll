/**
 * Contract addresses for Honor Roll smart contracts
 * Hardcoded from deployment configuration
 */

// Format addresses for use in the server
const contractAddresses = {
  // Base Mainnet
  BASE_MAINNET: {
    HONOR_TOKEN: '0x3B5CFF57B88EAF6838348D0f9f8282097aEF97Bf',
    VIDEO_MANAGER: '0x863c800ab5f15913bAc326E3B82de00570b003BF',
    VOTING_MANAGER: '0x9EFA392a09544639a2E5A846034D61Bca1585d32',
    USDC_MANAGER: '0x53c31B1eE936Ec146bDa2A39A99853Ef9B9C664a',
    YIELD_MANAGER: '0x701C7EcEff5acC38BAD9EfFB16bFcd65911a892E',
    CROSS_CHAIN_BRIDGE: '0x5FCD4f1B572C65d07cA4a95d22138E7E2514C585',
  }
};

module.exports = contractAddresses;
