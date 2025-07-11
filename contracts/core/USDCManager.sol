// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../interfaces/IAavePool.sol";
import "../interfaces/IHonorToken.sol";
import "../interfaces/IYieldManager.sol";

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
    address public yieldManager;
    
    // Total USDC deposited in Aave
    uint256 public totalValueLocked;
    
    // Events
    event USDCDeposited(address indexed user, uint256 amount);
    event USDCWithdrawn(address indexed to, uint256 amount, string reason);
    event OperatorWalletUpdated(address indexed oldWallet, address indexed newWallet);
    event YieldManagerUpdateFailed(string operation, uint256 amount);
    
    // Roles
    bytes32 public constant VIDEO_CREATOR_ROLE = keccak256("VIDEO_CREATOR_ROLE");
    
    /**
     * @dev Constructor
     * @param _honorToken Address of the HONOR token
     */
    constructor(address _honorToken) {
        // Hardcoded addresses for Base Mainnet
        usdcToken = IERC20(0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913); // Base USDC
        honorToken = IHonorToken(_honorToken);
        aavePool = IAavePool(0xA238Dd80C259a72e81d7e4664a9801593F98d1c5); // Base Aave Pool
        operatorWallet = msg.sender;
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(VIDEO_CREATOR_ROLE, msg.sender);
    }
    
    /**
     * @dev Set the YieldManager contract address
     * @param _yieldManager Address of the YieldManager contract
     * Requirements:
     * - Caller must be admin
     */
    function setYieldManager(address _yieldManager) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_yieldManager != address(0), "Invalid address");
        yieldManager = _yieldManager;
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
        
        // Get aToken address from YieldManager
        address aTokenAddress;
        if (yieldManager != address(0)) {
            try IYieldManager(yieldManager).aaveToken() returns (IERC20 aToken) {
                aTokenAddress = address(aToken);
            } catch {
                emit YieldManagerUpdateFailed("getAaveToken", amount);
            }
        }
        
        // Mint HONOR tokens to user
        honorToken.mint(msg.sender, amount);
        
        // Update total value locked
        totalValueLocked += amount;
        
        // Transfer aTokens to YieldManager and notify of the deposit if set
        if (yieldManager != address(0) && aTokenAddress != address(0)) {
            // Transfer aTokens to YieldManager
            IERC20 aToken = IERC20(aTokenAddress);
            uint256 aTokenBalance = aToken.balanceOf(address(this));
            
            // Make sure we have aTokens to transfer
            if (aTokenBalance > 0) {
                // Approve and transfer aTokens to YieldManager
                aToken.approve(yieldManager, aTokenBalance);
                
                try aToken.transfer(yieldManager, aTokenBalance) {
                    // Notify YieldManager of the deposit
                    try IYieldManager(yieldManager).recordDeposit(amount) {
                        // Success
                    } catch {
                        emit YieldManagerUpdateFailed("recordDeposit", amount);
                    }
                } catch {
                    emit YieldManagerUpdateFailed("transferATokens", aTokenBalance);
                }
            } else {
                emit YieldManagerUpdateFailed("noATokenBalance", 0);
            }
        }
        
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
        
        // Check if we have enough USDC in the contract
        uint256 usdcBalance = usdcToken.balanceOf(address(this));
        
        if (usdcBalance >= amount) {
            // We have enough USDC, transfer directly
            require(usdcToken.transfer(to, amount), "USDC transfer failed");
        } else if (yieldManager != address(0)) {
            // Not enough USDC, request from YieldManager
            try IYieldManager(yieldManager).withdrawUSDCForVideo(amount, to) {
                // Success - YieldManager will update its own accounting
            } catch {
                emit YieldManagerUpdateFailed("withdrawUSDCForVideo", amount);
                revert("Failed to withdraw from YieldManager");
            }
        } else {
            revert("Insufficient USDC and no YieldManager set");
        }
        
        // Update total value locked
        totalValueLocked -= amount;
        
        // No need to notify YieldManager as it handles the withdrawal itself when using withdrawUSDCForVideo
        // Only need to notify if we handled the transfer ourselves
        if (usdcBalance >= amount && yieldManager != address(0)) {
            try IYieldManager(yieldManager).recordWithdrawal(amount) {
                // Success
            } catch {
                emit YieldManagerUpdateFailed("recordWithdrawal", amount);
            }
        }
        
        emit USDCWithdrawn(to, amount, "Video creation");
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
