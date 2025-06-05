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
    address public videoManager;
    
    // Message tracking
    mapping(bytes32 => bool) public sentMessages;     // Track sent messages by ID
    mapping(bytes32 => bool) public processedMessages; // Track processed messages by ID
    mapping(uint256 => string) public videoIpIds;     // Map video IDs to Story Protocol IP IDs
    
    // Message types
    bytes32 public constant REGISTER_IP_ASSET = keccak256("REGISTER_IP_ASSET");
    bytes32 public constant UPDATE_ROYALTY_INFO = keccak256("UPDATE_ROYALTY_INFO");
    bytes32 public constant SYNC_IP_OWNERSHIP = keccak256("SYNC_IP_OWNERSHIP");
    
    // Events
    event MessageSent(bytes32 indexed messageType, bytes32 indexed messageId, bytes data);
    event MessageReceived(bytes32 indexed messageType, bytes32 indexed messageId, bytes data);
    event RoyaltyInfoUpdated(uint256 indexed videoId, bool success);
    event IPOwnershipSynced(uint256 indexed videoId, address newOwner, bool success);
    event IPAssetRegistered(uint256 indexed videoId, string ipId, bool success);
    
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
     * @dev Set the VideoManager contract address
     * @param _videoManager Address of the VideoManager contract
     * Requirements:
     * - Caller must be admin
     */
    function setVideoManager(address _videoManager) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_videoManager != address(0), "Invalid address");
        videoManager = _videoManager;
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
        // Calculate execution fee based on gas price and estimated gas usage
        uint256 executionFee = 200000 * tx.gasprice; // Estimate 200k gas for execution
        
        IDeBridgeGate.SubmissionAutoParamsTo memory autoParams = IDeBridgeGate.SubmissionAutoParamsTo({
            executionFee: executionFee,
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
        
        // Track sent message
        sentMessages[submissionId] = true;
        
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
        bytes memory data,
        bytes32 messageId
    ) external onlyRole(BRIDGE_OPERATOR_ROLE) nonReentrant {
        // Verify source chain and address
        require(srcChainId == storyChainId, "Invalid source chain");
        require(
            keccak256(srcAddress) == keccak256(abi.encodePacked(storyBridgeAddress)),
            "Invalid source address"
        );
        
        // Check if the message has already been processed
        require(!processedMessages[messageId], "Message already processed");
        
        // Mark the message as processed
        processedMessages[messageId] = true;
        
        // Extract the message type from the first 32 bytes
        bytes32 messageType;
        assembly {
            messageType := mload(add(data, 32))
        }
        
        emit MessageReceived(messageType, messageId, data);
        
        // Process the message based on its type
        if (messageType == REGISTER_IP_ASSET) {
            processIPAssetRegistration(data);
        } else if (messageType == UPDATE_ROYALTY_INFO) {
            processRoyaltyUpdate(data);
        } else if (messageType == SYNC_IP_OWNERSHIP) {
            processIPOwnershipSync(data);
        } else {
            revert("Unknown message type");
        }
    }
    
    /**
     * @dev Helper function to extract a string from bytes data at a specific offset
     * @param data The bytes data containing the string
     * @param offset The offset in the data where the string starts
     * @return The extracted string
     */
    function extractStringFromData(bytes memory data, uint256 offset) internal pure returns (string memory) {
        // The string is encoded as a dynamic type, so first we need to read its offset
        uint256 stringOffset;
        assembly {
            stringOffset := mload(add(data, offset))
        }
        
        // Now we need to read the length of the string
        uint256 length;
        assembly {
            length := mload(add(data, add(offset, stringOffset)))
        }
        
        // Create a new bytes array to hold the string data
        bytes memory stringBytes = new bytes(length);
        
        // Copy the string data
        assembly {
            let stringData := add(add(data, add(offset, stringOffset)), 32)
            let stringBytesData := add(stringBytes, 32)
            for { let i := 0 } lt(i, length) { i := add(i, 32) } {
                let chunk := mload(add(stringData, i))
                mstore(add(stringBytesData, i), chunk)
            }
        }
        
        return string(stringBytes);
    }
    
    /**
     * @dev Process IP asset registration confirmation
     * @param data Message data
     */
    function processIPAssetRegistration(bytes memory data) internal {
        // Extract parameters individually using assembly to avoid array slicing
        bytes32 messageType;
        uint256 videoId;
        bool success;
        string memory ipId;
        
        // Extract message type (first 32 bytes)
        assembly {
            messageType := mload(add(data, 32))
            videoId := mload(add(data, 64))
            success := gt(mload(add(data, 96)), 0)
        }
        
        // For the string, we need to extract it differently
        // The string data starts at offset 128 (32*4) in the data array
        // We'll use a separate function to extract the string from the data
        ipId = extractStringFromData(data, 128);
        
        // Ensure this is a registration message
        require(messageType == REGISTER_IP_ASSET, "Invalid message type");
        
        if (success) {
            // Store the IP ID
            videoIpIds[videoId] = ipId;
            
            // Call back to VideoManager to update the IP ID
            require(videoManager != address(0), "VideoManager not set");
            
            // Call the VideoManager to update the IP ID
            (bool callSuccess, ) = videoManager.call(
                abi.encodeWithSignature("setIpId(uint256,string)", videoId, ipId)
            );
            require(callSuccess, "Failed to update IP ID in VideoManager");
        }
        
        emit IPAssetRegistered(videoId, ipId, success);
    }
    
    /**
     * @dev Process royalty info update confirmation
     * @param data Message data
     */
    function processRoyaltyUpdate(bytes memory data) internal {
        // Extract parameters individually using assembly to avoid array slicing
        bytes32 messageType;
        uint256 videoId;
        bool success;
        
        assembly {
            // Load message type (first 32 bytes)
            messageType := mload(add(data, 32))
            // Load videoId (next 32 bytes)
            videoId := mload(add(data, 64))
            // Load success flag (next 32 bytes)
            // For boolean, we need to check if it's non-zero
            success := gt(mload(add(data, 96)), 0)
        }
        
        // Ensure this is a royalty update message
        require(messageType == UPDATE_ROYALTY_INFO, "Invalid message type");
        
        // We could emit an event here to notify the system of the update status
        if (success) {
            emit RoyaltyInfoUpdated(videoId, true);
        } else {
            emit RoyaltyInfoUpdated(videoId, false);
        }
    }
    
    /**
     * @dev Process IP ownership sync confirmation
     * @param data Message data
     */
    function processIPOwnershipSync(bytes memory data) internal {
        // Extract parameters individually using assembly to avoid array slicing
        bytes32 messageType;
        uint256 videoId;
        bool success;
        address newOwner;
        
        assembly {
            // Load message type (first 32 bytes)
            messageType := mload(add(data, 32))
            // Load videoId (next 32 bytes)
            videoId := mload(add(data, 64))
            // Load success flag (next 32 bytes)
            success := gt(mload(add(data, 96)), 0)
            // Load newOwner address (next 20 bytes, but stored in a 32 byte slot)
            newOwner := mload(add(data, 128))
            // Clean the address (addresses are 20 bytes but stored in 32 byte slots)
            newOwner := and(newOwner, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
        }
        
        // Ensure this is an ownership sync message
        require(messageType == SYNC_IP_OWNERSHIP, "Invalid message type");
        
        // We could emit an event here to notify the system of the update status
        if (success) {
            emit IPOwnershipSynced(videoId, newOwner, true);
        } else {
            emit IPOwnershipSynced(videoId, newOwner, false);
        }
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
