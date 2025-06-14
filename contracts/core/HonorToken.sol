// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title HonorToken
 * @dev ERC20 token for the Honor Roll platform
 * Users can purchase HONOR with USDC at a 1:1 ratio
 * HONOR is burned when creating videos (20 HONOR per video)
 */
contract HonorToken is ERC20, AccessControl, ReentrancyGuard {
    // Define roles
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    
    // Events
    event HonorMinted(address indexed to, uint256 amount);
    event HonorBurned(address indexed from, uint256 amount);
    
    /**
     * @dev Constructor
     * The deployer address will have admin rights
     */
    constructor() ERC20("Honor", "HONOR") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(BURNER_ROLE, msg.sender);
    }
    
    /**
     * @dev Mint new HONOR tokens
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     * Requirements:
     * - Caller must have MINTER_ROLE
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) nonReentrant {
        _mint(to, amount);
        emit HonorMinted(to, amount);
    }
    
    /**
     * @dev Burn HONOR tokens from an address
     * @param from Address to burn tokens from
     * @param amount Amount of tokens to burn
     * Requirements:
     * - Caller must have BURNER_ROLE
     * - 'from' must have approved the caller to spend tokens on their behalf
     */
    function burnFrom(address from, uint256 amount) external onlyRole(BURNER_ROLE) nonReentrant {
        _spendAllowance(from, _msgSender(), amount);
        _burn(from, amount);
        emit HonorBurned(from, amount);
    }
    
    /**
     * @dev Returns the number of decimals used for token amounts
     * Using 6 decimals to match USDC for easier 1:1 conversion
     */
    function decimals() public view virtual override returns (uint8) {
        return 6;
    }
}
