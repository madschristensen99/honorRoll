// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../interfaces/IDeBridgeGate.sol";

/**
 * @title IVideoManager
 * @dev Interface for VideoManager contract
 */
interface IVideoManager {
    function setIPId(uint256 videoId, string calldata ipId) external;
}

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
    address public ipAssetRegistryAddress;
    address public royaltyModuleAddress;
    address public callProxyAddress;
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
     * The deployer address will have admin rights
     */
    constructor() {
        // Hardcoded addresses and chain IDs for Base and Story Protocol
        deBridgeGate = IDeBridgeGate(0xc1656B63D9EEBa6d114f6bE19565177893e5bCBF); // deBridge gate on Base
        baseChainId = 8453; // Base Mainnet
        storyChainId = 100000013; // Story Protocol chain ID in deBridge format
        // Using the correct addresses from deploymentAddresses.js
        ipAssetRegistryAddress = 0x77319B4031e6eF1250907aa00018B8B1c67a244b; // IP_ASSET_REGISTRY address
        royaltyModuleAddress = 0xD2f60c40fEbccf6311f8B47c4f2Ec6b040400086; // ROYALTY_MODULE address
        callProxyAddress = 0x8a0C79F5532f3b2a16AD1E4282A5DAF81928a824; // deBridge CallProxy (same on all chains)
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(BRIDGE_OPERATOR_ROLE, msg.sender);
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
        
        // Prepare the function call data for Story Protocol's registerIpAsset function
        string memory parentIpId = "";
        if (!isOriginal && originalVideoId > 0) {
            parentIpId = videoIpIds[originalVideoId];
        }
        
        // Create the calldata for Story Protocol's IP Asset Registry registerIpAsset function
        bytes memory storyProtocolCallData = abi.encodeWithSignature(
            "registerIpAsset(address,string,bool,string)",
            creator,
            ipfsHash,
            isOriginal,
            parentIpId
        );
        
        // For CallProxy, we need to prepare the call parameters
        // The CallProxy.call function expects (address _reserveAddress, address _receiver, bytes _data, uint256 _flags, bytes _nativeSender, uint256 _chainIdFrom)
        bytes memory callProxyData = abi.encodeWithSignature(
            "call(address,address,bytes,uint256,bytes,uint256)",
            address(this),                // _reserveAddress (fallback if call fails)
            ipAssetRegistryAddress,       // _receiver (IP Asset Registry)
            storyProtocolCallData,        // _data (function call data)
            uint256(0),                   // _flags
            abi.encodePacked(address(this)), // _nativeSender
            baseChainId                   // _chainIdFrom
        );
        
        // Store video ID in a mapping for later use when we receive the callback with the IP ID
        // This is necessary to associate the IP ID with the correct video ID
        bytes32 messageKey = keccak256(abi.encode(REGISTER_IP_ASSET, videoId, block.timestamp));
        sentMessages[messageKey] = true;
        
        // Encode the complete message data for CallProxy with additional metadata for tracking
        bytes memory data = abi.encode(callProxyData, messageKey, videoId);
        
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
        
        // Get the IP ID for the video
        string memory ipId = videoIpIds[videoId];
        require(bytes(ipId).length > 0, "IP ID not found for video");
        
        // Create the calldata for Story Protocol's Royalty Module setRoyaltyInfo function
        bytes memory storyProtocolCallData = abi.encodeWithSignature(
            "setRoyaltyInfo(string,address[],uint256[])",
            ipId,
            creators,
            shares
        );
        
        // For CallProxy, we need to prepare the call parameters
        bytes memory callProxyData = abi.encodeWithSignature(
            "call(address,address,bytes,uint256,bytes,uint256)",
            address(this),                // _reserveAddress (fallback if call fails)
            royaltyModuleAddress,         // _receiver (Royalty Module)
            storyProtocolCallData,        // _data (function call data)
            uint256(0),                   // _flags
            abi.encodePacked(address(this)), // _nativeSender
            baseChainId                   // _chainIdFrom
        );
        
        // Store video ID in a mapping for later use when we receive the callback
        bytes32 messageKey = keccak256(abi.encode(UPDATE_ROYALTY_INFO, videoId, block.timestamp));
        sentMessages[messageKey] = true;
        
        // Encode the complete message data for CallProxy with additional metadata for tracking
        bytes memory data = abi.encode(callProxyData, messageKey, videoId);
        
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
     * @param data Encoded message data for CallProxy
     * @return messageId ID of the sent message
     */
    function sendCrossChainMessage(bytes memory data) internal returns (bytes32) {
        // Extract the callProxyData from the encoded data
        // The data format is: abi.encode(callProxyData, messageKey, videoId)
        bytes memory callProxyData;
        
        // Extract the callProxyData from the first part of the encoded data
        assembly {
            // Load the first 32 bytes which contain the offset to the callProxyData
            let offset := mload(add(data, 32))
            // Calculate the position of the callProxyData in memory
            let dataPos := add(data, offset)
            // Get the length of the callProxyData
            let dataLen := mload(dataPos)
            // Allocate memory for callProxyData
            callProxyData := mload(0x40)
            // Update free memory pointer
            mstore(0x40, add(add(callProxyData, 0x20), dataLen))
            // Store the length of callProxyData
            mstore(callProxyData, dataLen)
            // Copy the callProxyData
            let i := 0
            for { } lt(i, dataLen) { i := add(i, 32) } {
                mstore(add(add(callProxyData, 0x20), i), mload(add(add(dataPos, 0x20), i)))
            }
        }
        
        // Prepare deBridge submission
        // Use correct fee for Base chain
        uint256 executionFee = 0.001 ether; // Base chain fee
        
        IDeBridgeGate.SubmissionAutoParamsTo memory autoParams = IDeBridgeGate.SubmissionAutoParamsTo({
            executionFee: executionFee,
            flags: 0,
            fallbackAddress: abi.encodePacked(address(this)),
            data: data
        });
        
        // Submit cross-chain transaction using CallProxy
        bytes32 submissionId = deBridgeGate.sendAutoMessage{value: msg.value}(
            storyChainId,
            abi.encodePacked(callProxyAddress),
            callProxyData, // Use the extracted callProxyData
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
            keccak256(srcAddress) == keccak256(abi.encodePacked(callProxyAddress)),
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
     * @dev Extract IP ID from CallProxy response
     * @param data Response data from CallProxy
     * @return ipId The extracted IP ID
     */
    function extractIPIdFromResponse(bytes calldata data) external pure returns (string memory ipId) {
        // The CallProxy response includes the return value from the Story Protocol IP Asset Registry
        // The return value is a string (the IP ID)
        // We need to extract this string from the response data
        
        // The response data format depends on the CallProxy implementation
        // We expect the IP ID to be at a specific position in the response
        
        // First, check if the data is long enough to contain an IP ID
        require(data.length >= 64, "Invalid response data");
        
        // Extract the IP ID from the response
        // The IP ID is a string, so we need to extract its offset and length
        uint256 ipIdOffset;
        uint256 ipIdLength;
        
        // Extract the offset to the IP ID string
        assembly {
            // The offset is typically at position 32 in the response
            ipIdOffset := calldataload(add(data.offset, 32))
        }
        
        // Extract the length of the IP ID string
        assembly {
            // The length is at the position indicated by the offset
            ipIdLength := calldataload(add(add(data.offset, ipIdOffset), 0))
        }
        
        // Create a new bytes array to hold the IP ID string
        bytes memory ipIdBytes = new bytes(ipIdLength);
        
        // Copy the IP ID string data
        assembly {
            // The string data starts after the length word
            let ipIdData := add(add(data.offset, add(ipIdOffset, 32)), 0)
            let ipIdBytesData := add(ipIdBytes, 32)
            
            // Copy the string data byte by byte
            for { let i := 0 } lt(i, ipIdLength) { i := add(i, 1) } {
                let b := byte(0, calldataload(add(ipIdData, i)))
                mstore8(add(ipIdBytesData, i), b)
            }
        }
        
        return string(ipIdBytes);
    }
    
    /**
     * @dev Extract message metadata from CallProxy response
     * @param data Response data from CallProxy
     * @return messageKey The message key used to track the request
     * @return videoId The video ID associated with the request
     */
    function extractMessageMetadata(bytes calldata data) external pure returns (bytes32 messageKey, uint256 videoId) {
        // The CallProxy response includes our original metadata
        // We need to extract the message key and video ID from the response
        
        // Check if the data is long enough to contain the metadata
        require(data.length >= 96, "Invalid response data");
        
        // Extract the message key and video ID from the response
        assembly {
            // The message key is typically at position 64 in the response
            messageKey := calldataload(add(data.offset, 64))
            // The video ID is typically at position 96 in the response
            videoId := calldataload(add(data.offset, 96))
        }
        
        return (messageKey, videoId);
    }
    
    /**
     * @dev Process IP asset registration confirmation
     * @param data Message data
     */
    function processIPAssetRegistration(bytes memory data) internal {
        // The data format from CallProxy response is different from our original format
        // We need to extract the IP ID from the response and match it with the original request
        
        // Extract the message key and video ID from the data
        bytes32 messageKey;
        uint256 videoId;
        string memory ipId;
        
        // First, try to extract the IP ID from the response data
        // This is the return value from the Story Protocol IP Asset Registry
        try this.extractIPIdFromResponse(data) returns (string memory extractedIpId) {
            ipId = extractedIpId;
        } catch {
            // If extraction fails, emit event with failure
            emit IPAssetRegistered(0, "", false);
            return;
        }
        
        // Extract the message key and video ID from the response metadata
        // The CallProxy response should include our original metadata
        try this.extractMessageMetadata(data) returns (bytes32 extractedKey, uint256 extractedVideoId) {
            messageKey = extractedKey;
            videoId = extractedVideoId;
        } catch {
            // If extraction fails, emit event with failure
            emit IPAssetRegistered(0, ipId, false);
            return;
        }
        
        // Verify this message was sent by us
        if (!sentMessages[messageKey]) {
            emit IPAssetRegistered(videoId, ipId, false);
            return;
        }
        
        // Mark the message as processed
        processedMessages[messageKey] = true;
        
        // Store the IP ID for the video
        videoIpIds[videoId] = ipId;
        
        // Call back to VideoManager to update the IP ID
        if (videoManager != address(0)) {
            // Call the VideoManager to update the IP ID
            try IVideoManager(videoManager).setIPId(videoId, ipId) {
                // Success
                emit IPAssetRegistered(videoId, ipId, true);
            } catch {
                // Failed to update VideoManager but we still have the IP ID
                emit IPAssetRegistered(videoId, ipId, false);
            }
        } else {
            emit IPAssetRegistered(videoId, ipId, true);
        }
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
     * @dev Update the address of the deBridge CallProxy contract
     * @param _callProxyAddress Address of the CallProxy contract (same on all chains)
     * Requirements:
     * - Caller must be admin
     */
    function updateCallProxy(address _callProxyAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_callProxyAddress != address(0), "Invalid address");
        callProxyAddress = _callProxyAddress;
    }
    
    /**
     * @dev Receive function to accept ETH
     */
    receive() external payable {}
    
    /**
     * @dev Execute a message received from deBridge
     * @param srcChainId Source chain ID
     * @param srcAddress Source contract address
     * @param data Message data
     */
    function executeMessage(
        uint256 srcChainId,
        bytes calldata srcAddress,
        bytes calldata data
    ) external {
        // Verify the sender is deBridge
        require(msg.sender == address(deBridgeGate), "Only deBridge can execute");
        
        // Verify the source chain is Story Protocol chain
        require(srcChainId == storyChainId, "Invalid source chain");
        
        // Verify the source address is CallProxy
        address sourceAddress = bytesToAddress(srcAddress);
        require(sourceAddress == callProxyAddress, "Invalid source address");
        
        // Extract the message type from the data
        bytes32 messageType;
        assembly {
            messageType := calldataload(add(data.offset, 32))
        }
        
        // Process the message based on its type
        if (messageType == REGISTER_IP_ASSET) {
            processIPAssetRegistration(data);
        } else if (messageType == UPDATE_ROYALTY_INFO) {
            // Process royalty update confirmation
            // Implementation depends on your specific requirements
        } else if (messageType == SYNC_IP_OWNERSHIP) {
            // Process ownership sync confirmation
            // Implementation depends on your specific requirements
        } else {
            revert("Unknown message type");
        }
    }
    
    /**
     * @dev Convert bytes to address
     * @param _bytes Bytes to convert
     * @return addr Converted address
     */
    function bytesToAddress(bytes calldata _bytes) internal pure returns (address addr) {
        require(_bytes.length == 20, "Invalid address length");
        assembly {
            addr := shr(96, calldataload(_bytes.offset))
        }
    }
}
