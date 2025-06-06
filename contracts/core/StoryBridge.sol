// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../interfaces/IDeBridgeGate.sol";
import "../interfaces/IStoryProtocol.sol";

/**
 * @title StoryBridge
 * @dev Manages cross-chain communication between Story Protocol chain and Base chain
 * Receives messages from Base via deBridge and interacts with Story Protocol modules
 */
contract StoryBridge is AccessControl, ReentrancyGuard {
    // Constants
    uint256 public constant SUBMISSION_FEE = 0.001 ether; // Fee for cross-chain messages
    
    // State variables
    IDeBridgeGate public deBridgeGate;
    IStoryProtocol public storyProtocol;
    uint256 public baseChainId;
    uint256 public storyChainId;
    address public baseBridgeAddress;
    
    // Message tracking
    mapping(bytes32 => bool) public sentMessages;     // Track sent messages by ID
    mapping(bytes32 => bool) public processedMessages; // Track processed messages by ID
    mapping(uint256 => string) public videoIpIds;     // Map video IDs to Story Protocol IP IDs
    
    // Message types
    bytes32 public constant REGISTER_IP_ASSET = keccak256("REGISTER_IP_ASSET");
    bytes32 public constant UPDATE_ROYALTY_INFO = keccak256("UPDATE_ROYALTY_INFO");
    bytes32 public constant SYNC_IP_OWNERSHIP = keccak256("SYNC_IP_OWNERSHIP");
    bytes32 public constant IP_REGISTRATION_RESULT = keccak256("IP_REGISTRATION_RESULT");
    bytes32 public constant ROYALTY_UPDATE_RESULT = keccak256("ROYALTY_UPDATE_RESULT");
    bytes32 public constant IP_OWNERSHIP_SYNC_RESULT = keccak256("IP_OWNERSHIP_SYNC_RESULT");
    
    // Events
    event MessageSent(bytes32 indexed messageType, bytes32 indexed messageId, bytes data);
    event MessageReceived(bytes32 indexed messageType, bytes32 indexed messageId, bytes data);
    event IPAssetRegistered(uint256 indexed videoId, string ipId, bool success);
    event RoyaltyInfoUpdated(uint256 indexed videoId, bool success);
    event IPOwnershipSynced(uint256 indexed videoId, address newOwner, bool success);
    
    // Roles
    bytes32 public constant BRIDGE_OPERATOR_ROLE = keccak256("BRIDGE_OPERATOR_ROLE");
    
    /**
     * @dev Constructor
     * @param _deBridgeGate Address of the deBridge gate contract
     * @param _storyProtocol Address of the Story Protocol interface
     * @param _baseChainId Chain ID of the Base network
     * @param _storyChainId Chain ID of the Story Protocol network
     * @param _baseBridgeAddress Address of the bridge contract on Base chain
     * @param admin Address that will have admin rights
     */
    constructor(
        address _deBridgeGate,
        address _storyProtocol,
        uint256 _baseChainId,
        uint256 _storyChainId,
        address _baseBridgeAddress,
        address admin
    ) {
        deBridgeGate = IDeBridgeGate(_deBridgeGate);
        storyProtocol = IStoryProtocol(_storyProtocol);
        baseChainId = _baseChainId;
        storyChainId = _storyChainId;
        baseBridgeAddress = _baseBridgeAddress;
        
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(BRIDGE_OPERATOR_ROLE, admin);
    }
    
    /**
     * @dev Update the Story Protocol interface address
     * @param _storyProtocol Address of the Story Protocol interface
     * Requirements:
     * - Caller must be admin
     */
    function updateStoryProtocol(address _storyProtocol) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_storyProtocol != address(0), "Invalid address");
        storyProtocol = IStoryProtocol(_storyProtocol);
    }
    
    /**
     * @dev Update the Base bridge address
     * @param _baseBridgeAddress Address of the bridge contract on Base chain
     * Requirements:
     * - Caller must be admin
     */
    function updateBaseBridge(address _baseBridgeAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_baseBridgeAddress != address(0), "Invalid address");
        baseBridgeAddress = _baseBridgeAddress;
    }
    
    /**
     * @dev Receive message from Base chain via deBridge
     * @param srcChainId Source chain ID
     * @param srcAddress Source contract address
     * @param data Message data
     * @param messageId Message ID
     * Note: This function would be called by deBridge's protocol
     */
    function receiveMessage(
        uint256 srcChainId,
        bytes memory srcAddress,
        bytes memory data,
        bytes32 messageId
    ) external onlyRole(BRIDGE_OPERATOR_ROLE) nonReentrant {
        // Verify source chain and address
        require(srcChainId == baseChainId, "Invalid source chain");
        require(
            keccak256(srcAddress) == keccak256(abi.encodePacked(baseBridgeAddress)),
            "Invalid source address"
        );
        
        // Prevent replay attacks
        require(!processedMessages[messageId], "Message already processed");
        processedMessages[messageId] = true;
        
        // Extract message type
        bytes32 messageType;
        assembly {
            messageType := mload(add(data, 32))
        }
        
        emit MessageReceived(messageType, messageId, data);
        
        // Process message based on type
        if (messageType == REGISTER_IP_ASSET) {
            processIPAssetRegistration(data, messageId);
        } else if (messageType == UPDATE_ROYALTY_INFO) {
            processRoyaltyUpdate(data, messageId);
        } else if (messageType == SYNC_IP_OWNERSHIP) {
            processIPOwnershipSync(data, messageId);
        } else {
            revert("Unknown message type");
        }
    }
    
    /**
     * @dev Process IP asset registration request
     * @param data Message data
     */
    function processIPAssetRegistration(bytes memory data, bytes32) internal {
        // Extract parameters
        bytes32 messageType;
        uint256 videoId;
        address creator;
        string memory ipfsHash;
        bool isOriginal;
        uint256 originalVideoId;
        string memory parentIpId = "";
        
        // Extract message type and videoId
        assembly {
            messageType := mload(add(data, 32))
            videoId := mload(add(data, 64))
            // Load creator address (next 20 bytes, but stored in a 32 byte slot)
            creator := mload(add(data, 96))
            // Clean the address (addresses are 20 bytes but stored in 32 byte slots)
            creator := and(creator, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
        }
        
        // Extract ipfsHash (string)
        ipfsHash = extractStringFromData(data, 128);
        
        // Extract isOriginal and originalVideoId
        uint256 ipfsHashLength;
        assembly {
            // Calculate the offset after the string
            ipfsHashLength := mload(add(data, 128))
            // Load isOriginal (boolean)
            isOriginal := gt(mload(add(data, add(160, ipfsHashLength))), 0)
            // Load originalVideoId
            originalVideoId := mload(add(data, add(192, ipfsHashLength)))
        }
        
        // If this is a sequel, get the parent IP ID
        if (!isOriginal) {
            parentIpId = videoIpIds[originalVideoId];
        }
        
        // Register with Story Protocol
        string memory ipId;
        bool success = true;
        try storyProtocol.registerIpAsset(
            creator,
            ipfsHash,
            isOriginal,
            parentIpId
        ) returns (string memory _ipId) {
            ipId = _ipId;
            // Store the mapping
            videoIpIds[videoId] = ipId;
        } catch {
            success = false;
            ipId = "";
        }
        
        // Send result back to Base chain
        bytes memory resultData = abi.encode(
            IP_REGISTRATION_RESULT,
            videoId,
            success,
            ipId
        );
        
        sendCrossChainMessage(resultData);
        
        emit IPAssetRegistered(videoId, ipId, success);
    }
    
    /**
     * @dev Process royalty info update confirmation
     * @param data Message data
     */
    function processRoyaltyUpdate(bytes memory data, bytes32) internal {
        // Extract parameters
        bytes32 messageType;
        uint256 videoId;
        
        // Extract message type and videoId
        assembly {
            messageType := mload(add(data, 32))
            videoId := mload(add(data, 64))
        }
        
        // Extract creators array and shares array
        // This is complex due to dynamic arrays in ABI encoding
        // For simplicity, we'll use a helper function in a real implementation
        
        // Get the IP ID for this video
        string memory ipId = videoIpIds[videoId];
        require(bytes(ipId).length > 0, "IP ID not found for video");
        
        // For demonstration, we'll use dummy values
        address[] memory creators = new address[](1);
        creators[0] = address(0x1234567890123456789012345678901234567890);
        uint256[] memory shares = new uint256[](1);
        shares[0] = 10000; // 100% in basis points
        
        // Update royalty info in Story Protocol
        bool success = true;
        try storyProtocol.setRoyaltyInfo(
            ipId,
            creators,
            shares
        ) {
            // Success
        } catch {
            success = false;
        }
        
        // Send result back to Base chain
        bytes memory resultData = abi.encode(
            ROYALTY_UPDATE_RESULT,
            videoId,
            success
        );
        
        sendCrossChainMessage(resultData);
        
        emit RoyaltyInfoUpdated(videoId, success);
    }
    
    /**
     * @dev Process IP ownership sync request
     * @param data Message data
     */
    function processIPOwnershipSync(bytes memory data, bytes32) internal {
        // Extract parameters
        bytes32 messageType;
        uint256 videoId;
        address newOwner;
        
        // Extract message type, videoId, and newOwner
        assembly {
            messageType := mload(add(data, 32))
            videoId := mload(add(data, 64))
            // Load newOwner address
            newOwner := mload(add(data, 96))
            // Clean the address
            newOwner := and(newOwner, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
        }
        
        // Get the IP ID for this video
        string memory ipId = videoIpIds[videoId];
        require(bytes(ipId).length > 0, "IP ID not found for video");
        
        // Transfer ownership in Story Protocol
        bool success = true;
        try storyProtocol.transferIpOwnership(
            ipId,
            newOwner
        ) {
            // Success
        } catch {
            success = false;
        }
        
        // Send result back to Base chain
        bytes memory resultData = abi.encode(
            IP_OWNERSHIP_SYNC_RESULT,
            videoId,
            success,
            newOwner
        );
        
        sendCrossChainMessage(resultData);
        
        emit IPOwnershipSynced(videoId, newOwner, success);
    }
    
    /**
     * @dev Send a cross-chain message using deBridge
     * @param data Encoded message data
     * @return messageId ID of the sent message
     */
    function sendCrossChainMessage(bytes memory data) internal returns (bytes32) {
        // Prepare deBridge submission
        // Calculate execution fee based on gas price and estimated gas usage
        uint256 executionFee = 0.0005 ether; // Example fee
        
        // Set flags for the submission
        uint256 flags = 0;
        
        // Prepare auto params for deBridge
        IDeBridgeGate.SubmissionAutoParamsTo memory autoParams = IDeBridgeGate.SubmissionAutoParamsTo({
            executionFee: executionFee,
            flags: flags,
            fallbackAddress: bytes(""),
            data: data
        });
        
        // Submit the cross-chain message
        bytes32 messageId = deBridgeGate.sendAutoMessage{value: executionFee}(
            baseChainId,
            abi.encodePacked(baseBridgeAddress),
            data,
            autoParams
        );
        
        // Track the sent message
        sentMessages[messageId] = true;
        
        emit MessageSent(extractMessageType(data), messageId, data);
        
        return messageId;
    }
    
    /**
     * @dev Extract message type from data
     * @param data Message data
     * @return messageType Message type
     */
    function extractMessageType(bytes memory data) internal pure returns (bytes32) {
        bytes32 messageType;
        assembly {
            messageType := mload(add(data, 32))
        }
        return messageType;
    }
    
    /**
     * @dev Helper function to extract a string from bytes data at a specific offset
     * @param data The bytes data containing the string
     * @param offset The offset in the data where the string starts
     * @return The extracted string
     */
    function extractStringFromData(bytes memory data, uint256 offset) internal pure returns (string memory) {
        // Get the length of the string
        uint256 stringLength;
        assembly {
            stringLength := mload(add(data, offset))
        }
        
        // Create a bytes array to hold the string data
        bytes memory stringBytes = new bytes(stringLength);
        
        // Copy the string data byte by byte
        for (uint256 i = 0; i < stringLength; i++) {
            assembly {
                // Load 1 byte at a time
                let chunk := byte(0, mload(add(add(data, add(offset, 32)), i)))
                // Store it in the new bytes array
                mstore8(add(add(stringBytes, 32), i), chunk)
            }
        }
        
        return string(stringBytes);
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
