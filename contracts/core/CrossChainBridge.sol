// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../interfaces/IDeBridgeGate.sol";

/**
 * @title CrossChainBridge
 * @dev Manages cross-chain communication between Base and Story Protocol chains
 * Uses deBridge for trustless message passing
 */
contract CrossChainBridge is AccessControl, ReentrancyGuard {
    // Constants
    uint256 public constant SUBMISSION_FEE = 0.001 ether; // Fee for cross-chain messages
    
    // State variables
    IDeBridgeGate public deBridgeGate;
    uint256 public baseChainId;
    uint256 public storyChainId;
    address public storyBridgeAddress;
    
    // Message types
    bytes32 public constant REGISTER_IP_ASSET = keccak256("REGISTER_IP_ASSET");
    bytes32 public constant UPDATE_ROYALTY_INFO = keccak256("UPDATE_ROYALTY_INFO");
    bytes32 public constant SYNC_IP_OWNERSHIP = keccak256("SYNC_IP_OWNERSHIP");
    
    // Events
    event MessageSent(bytes32 indexed messageType, bytes32 indexed messageId, bytes data);
    event MessageReceived(bytes32 indexed messageType, bytes32 indexed messageId, bytes data);
    
    // Roles
    bytes32 public constant BRIDGE_OPERATOR_ROLE = keccak256("BRIDGE_OPERATOR_ROLE");
    
    /**
     * @dev Constructor
     * @param _deBridgeGate Address of the deBridge gate contract
     * @param _baseChainId Chain ID of the Base network
     * @param _storyChainId Chain ID of the Story Protocol network
     * @param _storyBridgeAddress Address of the bridge contract on Story Protocol chain
     * @param admin Address that will have admin rights
     */
    constructor(
        address _deBridgeGate,
        uint256 _baseChainId,
        uint256 _storyChainId,
        address _storyBridgeAddress,
        address admin
    ) {
        deBridgeGate = IDeBridgeGate(_deBridgeGate);
        baseChainId = _baseChainId;
        storyChainId = _storyChainId;
        storyBridgeAddress = _storyBridgeAddress;
        
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(BRIDGE_OPERATOR_ROLE, admin);
    }
    
    /**
     * @dev Send a message to register an IP asset on Story Protocol
     * @param videoId ID of the video to register
     * @param creator Address of the creator
     * @param ipfsHash IPFS hash of the video
     * @param isOriginal Whether this is an original video or a sequel
     * @param originalVideoId ID of the original video (if a sequel)
     * Requirements:
     * - Caller must have BRIDGE_OPERATOR_ROLE
     */
    function registerIPAsset(
        uint256 videoId,
        address creator,
        string memory ipfsHash,
        bool isOriginal,
        uint256 originalVideoId
    ) external payable onlyRole(BRIDGE_OPERATOR_ROLE) nonReentrant {
        require(msg.value >= SUBMISSION_FEE, "Insufficient fee");
        
        // Encode message data
        bytes memory data = abi.encode(
            REGISTER_IP_ASSET,
            videoId,
            creator,
            ipfsHash,
            isOriginal,
            originalVideoId
        );
        
        // Send cross-chain message
        bytes32 messageId = sendCrossChainMessage(data);
        
        emit MessageSent(REGISTER_IP_ASSET, messageId, data);
    }
    
    /**
     * @dev Send a message to update royalty information on Story Protocol
     * @param videoId ID of the video
     * @param creators Array of creator addresses
     * @param shares Array of royalty shares
     * Requirements:
     * - Caller must have BRIDGE_OPERATOR_ROLE
     */
    function updateRoyaltyInfo(
        uint256 videoId,
        address[] memory creators,
        uint256[] memory shares
    ) external payable onlyRole(BRIDGE_OPERATOR_ROLE) nonReentrant {
        require(msg.value >= SUBMISSION_FEE, "Insufficient fee");
        require(creators.length == shares.length, "Array length mismatch");
        
        // Encode message data
        bytes memory data = abi.encode(
            UPDATE_ROYALTY_INFO,
            videoId,
            creators,
            shares
        );
        
        // Send cross-chain message
        bytes32 messageId = sendCrossChainMessage(data);
        
        emit MessageSent(UPDATE_ROYALTY_INFO, messageId, data);
    }
    
    /**
     * @dev Send a message to synchronize IP ownership on Story Protocol
     * @param videoId ID of the video
     * @param newOwner Address of the new owner
     * Requirements:
     * - Caller must have BRIDGE_OPERATOR_ROLE
     */
    function syncIPOwnership(
        uint256 videoId,
        address newOwner
    ) external payable onlyRole(BRIDGE_OPERATOR_ROLE) nonReentrant {
        require(msg.value >= SUBMISSION_FEE, "Insufficient fee");
        
        // Encode message data
        bytes memory data = abi.encode(
            SYNC_IP_OWNERSHIP,
            videoId,
            newOwner
        );
        
        // Send cross-chain message
        bytes32 messageId = sendCrossChainMessage(data);
        
        emit MessageSent(SYNC_IP_OWNERSHIP, messageId, data);
    }
    
    /**
     * @dev Send a cross-chain message using deBridge
     * @param data Encoded message data
     * @return messageId ID of the sent message
     */
    function sendCrossChainMessage(bytes memory data) internal returns (bytes32) {
        // Prepare deBridge submission
        IDeBridgeGate.SubmissionAutoParamsTo memory autoParams = IDeBridgeGate.SubmissionAutoParamsTo({
            executionFee: 0, // Set appropriate execution fee
            flags: 0,
            fallbackAddress: abi.encodePacked(address(this)),
            data: data
        });
        
        // Submit cross-chain transaction
        bytes32 submissionId = deBridgeGate.sendAutoMessage{value: msg.value}(
            storyChainId,
            abi.encodePacked(storyBridgeAddress),
            data,
            autoParams
        );
        
        return submissionId;
    }
    
    /**
     * @dev Receive a cross-chain message from deBridge
     * @param srcChainId Source chain ID
     * @param srcAddress Source address
     * @param data Message data
     * Note: This function would be called by deBridge's protocol
     */
    function receiveMessage(
        uint256 srcChainId,
        bytes memory srcAddress,
        bytes memory data
    ) external {
        // Verify source chain and address
        require(srcChainId == storyChainId, "Invalid source chain");
        require(
            keccak256(srcAddress) == keccak256(abi.encodePacked(storyBridgeAddress)),
            "Invalid source address"
        );
        
        // Decode message type
        (bytes32 messageType) = abi.decode(data[:32], (bytes32));
        
        // Process message based on type
        if (messageType == REGISTER_IP_ASSET) {
            // Handle IP asset registration confirmation
            processIPAssetRegistration(data);
        } else if (messageType == UPDATE_ROYALTY_INFO) {
            // Handle royalty info update confirmation
            processRoyaltyUpdate(data);
        } else if (messageType == SYNC_IP_OWNERSHIP) {
            // Handle IP ownership sync confirmation
            processIPOwnershipSync(data);
        } else {
            revert("Unknown message type");
        }
        
        emit MessageReceived(messageType, bytes32(0), data);
    }
    
    /**
     * @dev Process IP asset registration confirmation
     * @param data Message data
     */
    function processIPAssetRegistration(bytes memory data) internal {
        // In a real implementation, this would update local state
        // based on the confirmation from Story Protocol
        
        // Example:
        // (bytes32 messageType, uint256 videoId, bool success, string memory ipId) = 
        //     abi.decode(data, (bytes32, uint256, bool, string));
        // if (success) {
        //     // Update local state with IP ID
        // }
    }
    
    /**
     * @dev Process royalty info update confirmation
     * @param data Message data
     */
    function processRoyaltyUpdate(bytes memory data) internal {
        // In a real implementation, this would update local state
        // based on the confirmation from Story Protocol
    }
    
    /**
     * @dev Process IP ownership sync confirmation
     * @param data Message data
     */
    function processIPOwnershipSync(bytes memory data) internal {
        // In a real implementation, this would update local state
        // based on the confirmation from Story Protocol
    }
    
    /**
     * @dev Withdraw any excess ETH from the contract
     * @param to Address to send ETH to
     * @param amount Amount of ETH to withdraw
     * Requirements:
     * - Caller must be admin
     */
    function withdrawETH(address payable to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(amount <= address(this).balance, "Insufficient balance");
        (bool success, ) = to.call{value: amount}("");
        require(success, "ETH transfer failed");
    }
    
    /**
     * @dev Receive function to accept ETH
     */
    receive() external payable {}
}
