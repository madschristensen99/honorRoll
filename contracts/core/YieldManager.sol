// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../interfaces/IAavePool.sol";

/**
 * @title YieldManager
 * @dev Manages yield collection from Aave and distribution to creators and voters
 */
contract YieldManager is AccessControl, ReentrancyGuard {
    // Constants
    uint256 public constant VIDEO_COST = 20 * 10**6; // 20 USDC with 6 decimals
    uint256 public constant CREATOR_SHARE_PERCENT = 20;
    uint256 public constant VOTER_SHARE_PERCENT = 80;
    
    // State variables
    IAavePool public aavePool;
    IERC20 public usdcToken;
    IERC20 public aaveToken;  // aToken for USDC in Aave
    address public operatorWallet;
    
    // Total USDC deposited in Aave
    uint256 public totalValueLocked;
    
    // Undistributed yield
    uint256 public undistributedYield;
    
    // Last yield collection timestamp
    uint256 public lastYieldCollectionTime;
    
    // Last recorded aToken balance
    uint256 public lastATokenBalance;
    
    // Roles
    bytes32 public constant YIELD_DISTRIBUTOR_ROLE = keccak256("YIELD_DISTRIBUTOR_ROLE");
    
    // Events
    event YieldCollected(uint256 amount, uint256 timestamp);
    event YieldDistributed(uint256 videoId, uint256 creatorAmount, uint256 voterAmount);
    event TotalValueLockedUpdated(uint256 newAmount);
    
    /**
     * @dev Constructor
     * @param _aavePool Address of the Aave lending pool
     * @param _usdcToken Address of the USDC token contract
     * @param _operatorWallet Address of the operator wallet
     * @param admin Address that will have admin rights
     */
    constructor(
        address _aavePool,
        address _usdcToken,
        address _aaveToken,
        address _operatorWallet,
        address admin
    ) {
        aavePool = IAavePool(_aavePool);
        usdcToken = IERC20(_usdcToken);
        aaveToken = IERC20(_aaveToken);
        operatorWallet = _operatorWallet;
        lastYieldCollectionTime = block.timestamp;
        
        // Initialize last aToken balance
        lastATokenBalance = aaveToken.balanceOf(address(this));
        
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(YIELD_DISTRIBUTOR_ROLE, admin);
    }
    
    /**
     * @dev Collects yield from Aave and adds to undistributed pool
     * Can be called by anyone, but primarily by the distributeYield function
     */
    function collectYield() public nonReentrant {
        uint256 currentYield = calculateCurrentYield();
        if (currentYield > 0) {
            undistributedYield += currentYield;
            
            // Update the last aToken balance
            lastATokenBalance = aaveToken.balanceOf(address(this));
            
            lastYieldCollectionTime = block.timestamp;
            
            emit YieldCollected(currentYield, block.timestamp);
        }
    }
    
    /**
     * @dev Distributes yield for a specific video
     * @param videoId ID of the video triggering distribution
     * @param previousCreators Array of addresses of previous creators in the sequence
     * @param winningVoters Array of addresses that voted for winning choice
     * @param voterWeights Array of voting weights (HONOR balances)
     * Requirements:
     * - Caller must have YIELD_DISTRIBUTOR_ROLE
     * - Arrays must be valid and matching
     */
    function distributeYield(
        uint256 videoId,
        address[] memory previousCreators,
        address[] memory winningVoters,
        uint256[] memory voterWeights
    ) external onlyRole(YIELD_DISTRIBUTOR_ROLE) nonReentrant {
        require(winningVoters.length == voterWeights.length, "Array length mismatch");
        
        // Collect any pending yield first
        collectYield();
        
        // Calculate yield for this event
        uint256 eventYield = calculateEventYield();
        if (eventYield == 0) return; // No yield to distribute
        
        // Calculate creator and voter portions
        uint256 creatorPortion = (eventYield * CREATOR_SHARE_PERCENT) / 100;
        uint256 voterPortion = (eventYield * VOTER_SHARE_PERCENT) / 100;
        
        // Distribute to creators
        distributeToCreators(previousCreators, creatorPortion);
        
        // Distribute to voters
        distributeToVoters(winningVoters, voterWeights, voterPortion);
        
        // Subtract distributed yield from undistributed pool
        undistributedYield -= eventYield;
        
        emit YieldDistributed(videoId, creatorPortion, voterPortion);
    }
    
    /**
     * @dev Calculates yield for a specific event based on video cost relative to TVL
     * @return Amount of yield to distribute for this event
     */
    function calculateEventYield() internal view returns (uint256) {
        // If no value is locked or no undistributed yield, return 0
        if (totalValueLocked == 0 || undistributedYield == 0) return 0;
        
        // Calculate event yield based on video cost relative to TVL
        uint256 eventYield = (undistributedYield * VIDEO_COST) / totalValueLocked;
        
        // Cap at available undistributed yield
        return eventYield > undistributedYield ? undistributedYield : eventYield;
    }
    
    /**
     * @dev Distributes creator portion evenly among previous creators
     * @param creators Array of creator addresses
     * @param amount Total amount to distribute
     */
    function distributeToCreators(address[] memory creators, uint256 amount) internal {
        if (creators.length == 0) return;
        
        uint256 sharePerCreator = amount / creators.length;
        
        for (uint256 i = 0; i < creators.length; i++) {
            // Transfer USDC to each creator
            require(usdcToken.transfer(creators[i], sharePerCreator), "USDC transfer failed");
        }
    }
    
    /**
     * @dev Distributes voter portion proportionally to voting weight
     * @param voters Array of voter addresses
     * @param weights Array of voting weights
     * @param amount Total amount to distribute
     */
    function distributeToVoters(
        address[] memory voters,
        uint256[] memory weights,
        uint256 amount
    ) internal {
        if (voters.length == 0) return;
        
        // Calculate total voting weight
        uint256 totalWeight = 0;
        for (uint256 i = 0; i < weights.length; i++) {
            totalWeight += weights[i];
        }
        
        // Distribute proportionally
        for (uint256 i = 0; i < voters.length; i++) {
            uint256 voterShare = (amount * weights[i]) / totalWeight;
            require(usdcToken.transfer(voters[i], voterShare), "USDC transfer failed");
        }
    }
    
    /**
     * @dev Calculates current yield from Aave
     * @return Current yield amount
     * Note: In a real implementation, this would query Aave for the actual yield
     */
    function calculateCurrentYield() internal view returns (uint256) {
        // Get current aToken balance
        uint256 currentATokenBalance = aaveToken.balanceOf(address(this));
        
        // If current balance is less than or equal to last recorded balance, no yield
        if (currentATokenBalance <= lastATokenBalance) {
            return 0;
        }
        
        // Calculate yield as the difference between current and last balance
        uint256 yieldAmount = currentATokenBalance - lastATokenBalance;
        
        return yieldAmount;
    }
    
    /**
     * @dev Updates total value locked when USDC is deposited to Aave
     * @param amount Amount deposited
     * Requirements:
     * - Caller must be admin
     */
    function recordDeposit(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        totalValueLocked += amount;
        
        // Update the last aToken balance after deposit
        lastATokenBalance = aaveToken.balanceOf(address(this));
        
        emit TotalValueLockedUpdated(totalValueLocked);
    }
    
    /**
     * @dev Updates total value locked when USDC is withdrawn from Aave
     * @param amount Amount withdrawn
     * Requirements:
     * - Caller must be admin
     */
    function recordWithdrawal(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (amount > totalValueLocked) {
            totalValueLocked = 0;
        } else {
            totalValueLocked -= amount;
        }
        
        // Update the last aToken balance after withdrawal
        lastATokenBalance = aaveToken.balanceOf(address(this));
        
        emit TotalValueLockedUpdated(totalValueLocked);
    }
}
