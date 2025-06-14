// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IYieldManager
 * @dev Interface for the YieldManager contract
 */
interface IYieldManager {
    /**
     * @dev Returns the aToken used for yield generation
     */
    function aaveToken() external view returns (IERC20);
    /**
     * @dev Distribute yield to creators and voters
     * @param videoId ID of the video triggering distribution
     * @param previousCreators Array of addresses of previous creators in the sequence
     * @param winningVoters Array of addresses that voted for winning choice
     * @param voterWeights Array of voting weights (HONOR balances)
     */
    function distributeYield(
        uint256 videoId,
        address[] memory previousCreators,
        address[] memory winningVoters,
        uint256[] memory voterWeights
    ) external;
    
    /**
     * @dev Collects yield from Aave and adds to undistributed pool
     */
    function collectYield() external;
    
    /**
     * @dev Updates total value locked when USDC is deposited to Aave
     * @param amount Amount deposited
     */
    function recordDeposit(uint256 amount) external;
    
    /**
     * @dev Updates total value locked when USDC is withdrawn from Aave
     * @param amount Amount withdrawn
     */
    function recordWithdrawal(uint256 amount) external;
    
    /**
     * @dev Withdraws USDC from Aave and sends it to the specified address
     * @param amount Amount of USDC to withdraw
     * @param to Address to send USDC to
     */
    function withdrawUSDCForVideo(uint256 amount, address to) external;
    
    /**
     * @dev Emergency function to recover aTokens and withdraw USDC
     * @param amount Amount of USDC to withdraw
     * @param to Address to send USDC to
     */
    function emergencyWithdraw(uint256 amount, address to) external;
    
    /**
     * @dev Get the current aToken balance
     * @return Current aToken balance
     */
    function getATokenBalance() external view returns (uint256);
}
