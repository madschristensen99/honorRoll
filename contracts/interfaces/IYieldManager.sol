// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IYieldManager
 * @dev Interface for the YieldManager contract
 */
interface IYieldManager {
    /**
     * @dev Collects yield from Aave and adds to undistributed pool
     */
    function collectYield() external;
    
    /**
     * @dev Distributes yield for a specific video
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
}
