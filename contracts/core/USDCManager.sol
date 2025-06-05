// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../interfaces/IAavePool.sol";
import "../interfaces/IHonorToken.sol";

/**
 * @title USDCManager
 * @dev Manages USDC deposits, withdrawals, and Aave interactions
 * Users deposit USDC to receive HONOR at 1:1 ratio
 * USDC is deposited into Aave to generate yield
 */
contract USDCManager is AccessControl, ReentrancyGuard {
    // Constants
    uint256 public constant VIDEO_COST = 20 * 10**6; // 20 USDC (6 decimals)
    
    // State variables
    IERC20 public usdcToken;
    IHonorToken public honorToken;
    IAavePool public aavePool;
    address public operatorWallet;
    
    // Total USDC deposited in Aave
    uint256 public totalValueLocked;
    
    // Events
    event USDCDeposited(address indexed user, uint256 amount);
    event USDCWithdrawn(address indexed to, uint256 amount, string reason);
    event OperatorWalletUpdated(address indexed oldWallet, address indexed newWallet);
    
    // Roles
    bytes32 public constant VIDEO_CREATOR_ROLE = keccak256("VIDEO_CREATOR_ROLE");
    
    /**
     * @dev Constructor
     * @param _usdcToken Address of the USDC token contract
     * @param _honorToken Address of the HONOR token contract
     * @param _aavePool Address of the Aave lending pool
     * @param _operatorWallet Address of the operator wallet
     * @param admin Address that will have admin rights
     */
    constructor(
        address _usdcToken,
        address _honorToken,
        address _aavePool,
        address _operatorWallet,
        address admin
    ) {
        usdcToken = IERC20(_usdcToken);
        honorToken = IHonorToken(_honorToken);
        aavePool = IAavePool(_aavePool);
        operatorWallet = _operatorWallet;
        
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(VIDEO_CREATOR_ROLE, admin);
    }
    
    /**
     * @dev Deposit USDC and receive HONOR tokens
     * @param amount Amount of USDC to deposit
     */
    function depositUSDC(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        
        // Transfer USDC from user to this contract
        require(usdcToken.transferFrom(msg.sender, address(this), amount), "USDC transfer failed");
        
        // Approve Aave to spend USDC
        usdcToken.approve(address(aavePool), amount);
        
        // Deposit USDC to Aave
        aavePool.deposit(address(usdcToken), amount, address(this), 0);
        
        // Mint HONOR tokens to user
        honorToken.mint(msg.sender, amount);
        
        // Update total value locked
        totalValueLocked += amount;
        
        emit USDCDeposited(msg.sender, amount);
    }
    
    /**
     * @dev Withdraw USDC for video creation
     * @param amount Amount of USDC to withdraw
     * @param to Address to send USDC to
     * Requirements:
     * - Caller must have VIDEO_CREATOR_ROLE
     */
    function withdrawForVideo(uint256 amount, address to) external onlyRole(VIDEO_CREATOR_ROLE) nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(amount <= totalValueLocked, "Insufficient USDC in pool");
        
        // Withdraw USDC from Aave
        aavePool.withdraw(address(usdcToken), amount, address(this));
        
        // Transfer USDC to the specified address
        require(usdcToken.transfer(to, amount), "USDC transfer failed");
        
        // Update total value locked
        totalValueLocked -= amount;
        
        emit USDCWithdrawn(to, amount, "Video Creation");
    }
    
    /**
     * @dev Update the operator wallet address
     * @param newOperatorWallet New operator wallet address
     * Requirements:
     * - Caller must be admin
     */
    function updateOperatorWallet(address newOperatorWallet) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newOperatorWallet != address(0), "Invalid address");
        emit OperatorWalletUpdated(operatorWallet, newOperatorWallet);
        operatorWallet = newOperatorWallet;
    }
    
    /**
     * @dev Get the current USDC balance of this contract
     * @return USDC balance
     */
    function getUSDCBalance() external view returns (uint256) {
        return usdcToken.balanceOf(address(this));
    }
}
