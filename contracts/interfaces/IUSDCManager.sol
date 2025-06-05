// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IUSDCManager
 * @dev Interface for the USDCManager contract
 */
interface IUSDCManager {
    /**
     * @dev Deposit USDC and receive HONOR tokens
     * @param amount Amount of USDC to deposit
     */
    function depositUSDC(uint256 amount) external;
    
    /**
     * @dev Withdraw USDC for video creation
     * @param amount Amount of USDC to withdraw
     * @param to Address to send USDC to
     */
    function withdrawForVideo(uint256 amount, address to) external;
    
    /**
     * @dev Get the current USDC balance of this contract
     * @return USDC balance
     */
    function getUSDCBalance() external view returns (uint256);
    
    /**
     * @dev Get the USDC token contract
     */
    function usdcToken() external view returns (IERC20);
}
