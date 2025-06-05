// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IHonorToken
 * @dev Interface for the HonorToken contract
 */
interface IHonorToken is IERC20 {
    /**
     * @dev Mint new HONOR tokens
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     */
    function mint(address to, uint256 amount) external;
    
    /**
     * @dev Burn HONOR tokens from an address
     * @param from Address to burn tokens from
     * @param amount Amount of tokens to burn
     */
    function burnFrom(address from, uint256 amount) external;
}
