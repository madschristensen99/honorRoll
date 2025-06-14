// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../interfaces/IHonorToken.sol";
import "../interfaces/IUSDCManager.sol";
import "../interfaces/IYieldManager.sol";
import "../interfaces/IStoryProtocol.sol";

/**
 * @title VideoManager
 * @dev Manages video creation, sequences, and IP registration with Story Protocol
 */
contract VideoManager is AccessControl, ReentrancyGuard {
    // Constants
    uint256 public constant VIDEO_CREATION_COST = 20 * 10**6; // 20 HONOR (6 decimals)
    uint256 public constant ROYALTY_AMOUNT = 1 * 10**6; // 1 USDC for royalties
    
    // Video data structure
    struct Video {
        uint256 id;
        address creator;
        uint256 nextVideoId;  // Next video in sequence (0 if none)
        bool isOriginal;      // True if this is the first video in a sequence
        uint256 sequenceHead; // ID of the original video in the sequence
        uint256 sequenceLength; // Number of videos in the sequence
        string prompt;        // Video prompt/description
        string livepeerLink;  // Livepeer link to the video
        uint256 creationTime; // When the video was created
        bool registered;     // Whether registered with Story Protocol
        string ipId;         // Story Protocol IP ID when registered
        uint256 bridgeFee;   // Stored fee for deBridge
    }
    
    // State variables
    IHonorToken public honorToken;
    IUSDCManager public usdcManager;
    IYieldManager public yieldManager;
    IStoryProtocol public storyProtocol;
    address public operatorWallet;
    address public crossChainBridge; // Address of CrossChainBridge contract
    
    // Video storage
    mapping(uint256 => Video) public videos;
    uint256 public nextVideoId = 1;
    
    // Events
    event VideoCreated(
        uint256 indexed videoId, 
        address indexed creator, 
        bool isOriginal, 
        uint256 sequenceHead,
        string prompt
    );
    event IPRegistered(uint256 indexed videoId, string livepeerLink);
    event IPIdReceived(uint256 indexed videoId, string ipId);
    event VideoIPRegistered(uint256 indexed videoId, string ipId);
    
    // Roles
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant BRIDGE_CALLBACK_ROLE = keccak256("BRIDGE_CALLBACK_ROLE");
    
    /**
     * @dev Constructor
     * @param _honorToken Address of the HONOR token contract
     * @param _usdcManager Address of the USDC manager contract
     * @param _yieldManager Address of the yield manager contract
     */
    constructor(
        address _honorToken,
        address _usdcManager,
        address _yieldManager
    ) {
        honorToken = IHonorToken(_honorToken);
        usdcManager = IUSDCManager(_usdcManager);
        yieldManager = IYieldManager(_yieldManager);
        
        // Hardcoded Story Protocol interface address
        storyProtocol = IStoryProtocol(0x4F7a67464b5976D7547C860109e4432D50E90eEB);
        
        // Deployer is operator wallet
        operatorWallet = msg.sender;
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(OPERATOR_ROLE, msg.sender);
    }
    
    /**
     * @dev Set the CrossChainBridge contract address
     * @param _crossChainBridge Address of the CrossChainBridge contract
     * Requirements:
     * - Caller must be admin
     */
    function setCrossBridgeAddress(address _crossChainBridge) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_crossChainBridge != address(0), "Invalid address");
        crossChainBridge = _crossChainBridge;
    }
    
    /**
     * @dev Create a new original video (not a sequel)
     * @param creator Address of the video creator
     * @param prompt Description/prompt of the video
     * Requirements:
     * - Creator must have approved this contract to spend their HONOR
     */
    function createOriginalVideo(
        address creator,
        string memory prompt
    ) external payable nonReentrant returns (uint256) {
        require(msg.value >= 0.001 ether, "Must include 0.001 ETH for deBridge fee");
        // Check that creator has enough HONOR tokens
        require(honorToken.balanceOf(creator) >= VIDEO_CREATION_COST, "Insufficient HONOR balance");
        
        // Check that creator has approved this contract to spend their HONOR tokens
        require(honorToken.allowance(creator, address(this)) >= VIDEO_CREATION_COST, "Insufficient HONOR allowance");
        
        // Burn HONOR tokens from creator
        honorToken.burnFrom(creator, VIDEO_CREATION_COST);
        
        // Withdraw USDC from Aave and send to operator
        usdcManager.withdrawForVideo(VIDEO_CREATION_COST, operatorWallet);
        
        // Create video record
        uint256 videoId = nextVideoId++;
        videos[videoId] = Video({
            id: videoId,
            creator: creator,
            nextVideoId: 0,
            isOriginal: true,
            sequenceHead: videoId, // Self-reference for original videos
            sequenceLength: 1,
            prompt: prompt,
            livepeerLink: "",  // Will be set by operator later
            creationTime: block.timestamp,
            registered: false,
            ipId: "",
            bridgeFee: msg.value
        });
        
        // Video will be registered with Story Protocol after Livepeer link is set
        
        emit VideoCreated(videoId, creator, true, videoId, prompt);
        
        return videoId;
    }
    
    /**
     * @dev Create a sequel video
     * @param creator Address of the video creator
     * @param originalVideoId ID of the original video this is a sequel to
     * @param prompt Description/prompt of the video
     * Requirements:
     * - Creator must have approved this contract to spend their HONOR
     * - Original video must exist
     */
    function createSequelVideo(
        address creator,
        uint256 originalVideoId,
        string memory prompt
    ) external payable nonReentrant returns (uint256) {
        require(msg.value >= 0.001 ether, "Must include 0.001 ETH for deBridge fee");
        // Verify original video exists
        Video storage originalVideo = videos[originalVideoId];
        require(originalVideo.id != 0, "Original video does not exist");
        
        // Find the sequence head (in case originalVideoId is not the head)
        uint256 sequenceHead = originalVideo.isOriginal ? originalVideoId : originalVideo.sequenceHead;
        require(sequenceHead != 0, "Invalid sequence head");
        
        // Check that creator has enough HONOR tokens
        require(honorToken.balanceOf(creator) >= VIDEO_CREATION_COST, "Insufficient HONOR balance");
        
        // Check that creator has approved this contract to spend their HONOR tokens
        require(honorToken.allowance(creator, address(this)) >= VIDEO_CREATION_COST, "Insufficient HONOR allowance");
        
        // Burn HONOR tokens from creator
        honorToken.burnFrom(creator, VIDEO_CREATION_COST);
        
        // Withdraw USDC from Aave
        usdcManager.withdrawForVideo(VIDEO_CREATION_COST, address(this));
        
        // Distribute royalties to previous creators
        address[] memory previousCreators = getPreviousCreators(sequenceHead);
        distributeRoyalties(previousCreators);
        
        // Send remaining USDC to operator
        uint256 operatorAmount = VIDEO_CREATION_COST - ROYALTY_AMOUNT;
        require(
            IERC20(address(usdcManager.usdcToken())).transfer(operatorWallet, operatorAmount),
            "Operator payment failed"
        );
        
        // Create video record
        uint256 videoId = nextVideoId++;
        videos[videoId] = Video({
            id: videoId,
            creator: creator,
            nextVideoId: 0,
            isOriginal: false,
            sequenceHead: sequenceHead,
            sequenceLength: 1, // Will be updated by addToSequence
            prompt: prompt,
            livepeerLink: "", // Will be set by operator later
            creationTime: block.timestamp,
            registered: false,
            ipId: "",
            bridgeFee: msg.value
        });
        
        // Add to sequence
        addToSequence(sequenceHead, videoId);
        
        // Video will be registered with Story Protocol after Livepeer link is set
        
        // This would be implemented by the VotingManager, which would call YieldManager
        
        emit VideoCreated(videoId, creator, false, sequenceHead, prompt);
        
        return videoId;
    }
    
    /**
     * @dev Add a video to a sequence
     * @param sequenceHead ID of the sequence head
     * @param videoId ID of the video to add
     */
    function addToSequence(uint256 sequenceHead, uint256 videoId) internal {
        Video storage headVideo = videos[sequenceHead];
        Video storage newVideo = videos[videoId];
        
        // Find the last video in the sequence
        uint256 currentId = sequenceHead;
        while (videos[currentId].nextVideoId != 0) {
            currentId = videos[currentId].nextVideoId;
        }
        
        // Add new video to the end of the sequence
        videos[currentId].nextVideoId = videoId;
        
        // Update sequence length
        headVideo.sequenceLength += 1;
        newVideo.sequenceLength = headVideo.sequenceLength;
    }
    
    /**
     * @dev Get all previous creators in a sequence
     * @param sequenceHead ID of the sequence head
     * @return Array of creator addresses
     */
    function getPreviousCreators(uint256 sequenceHead) internal view returns (address[] memory) {
        Video storage headVideo = videos[sequenceHead];
        uint256 count = headVideo.sequenceLength;
        
        address[] memory creators = new address[](count);
        
        uint256 currentId = sequenceHead;
        uint256 index = 0;
        
        while (currentId != 0 && index < count) {
            creators[index] = videos[currentId].creator;
            currentId = videos[currentId].nextVideoId;
            index++;
        }
        
        return creators;
    }
    
    /**
     * @dev Distribute royalties to previous creators
     * @param creators Array of creator addresses
     */
    function distributeRoyalties(address[] memory creators) internal {
        if (creators.length == 0) return;
        
        uint256 sharePerCreator = ROYALTY_AMOUNT / creators.length;
        IERC20 usdcToken = IERC20(address(usdcManager.usdcToken()));
        
        for (uint256 i = 0; i < creators.length; i++) {
            require(usdcToken.transfer(creators[i], sharePerCreator), "Royalty payment failed");
        }
    }
    
    /**
     * @dev Register a video with Story Protocol
     * @param videoId ID of the video to register
     * Note: This is a placeholder for the actual Story Protocol integration
     */
    function registerWithStoryProtocol(uint256 videoId) internal {
        require(crossChainBridge != address(0), "CrossChainBridge not set");
        
        Video storage video = videos[videoId];
        require(bytes(video.livepeerLink).length > 0, "Video link not set");
        
        // Get parent IP ID if this is a sequel
        string memory parentIpId = "";
        if (!video.isOriginal) {
            Video storage parentVideo = videos[video.sequenceHead];
            require(parentVideo.registered, "Parent video not registered with Story Protocol");
            parentIpId = parentVideo.ipId;
        }
        
        // Call CrossChainBridge to register with Story Protocol
        bytes memory callData = abi.encodeWithSignature(
            "registerIPAsset(uint256,address,string,bool,uint256)",
            videoId,
            video.creator,
            video.livepeerLink,
            video.isOriginal,
            video.isOriginal ? 0 : video.sequenceHead
        );
        
        // Forward call to CrossChainBridge with the stored deBridge fee
        uint256 bridgeFee = video.bridgeFee;
        (bool success, ) = crossChainBridge.call{value: bridgeFee}(callData);
        require(success, "Failed to call CrossChainBridge");
        
        // Mark as registration in progress
        // The actual IP ID will be set when we receive confirmation from Story Protocol
        video.registered = true;
        
        emit IPRegistered(videoId, video.livepeerLink);
    }
    
    /**
     * @dev Get video details
     * @param videoId ID of the video
     * @return Video details
     */
    function getVideo(uint256 videoId) external view returns (Video memory) {
        return videos[videoId];
    }
    
    /**
     * @dev Get all videos in a sequence
     * @param sequenceHead ID of the sequence head
     * @return Array of video IDs
     */
    function getSequenceVideos(uint256 sequenceHead) external view returns (uint256[] memory) {
        Video storage headVideo = videos[sequenceHead];
        uint256 count = headVideo.sequenceLength;
        
        uint256[] memory videoIds = new uint256[](count);
        
        uint256 currentId = sequenceHead;
        uint256 index = 0;
        
        while (currentId != 0 && index < count) {
            videoIds[index] = currentId;
            currentId = videos[currentId].nextVideoId;
            index++;
        }
        
        return videoIds;
    }
    
    /**
     * @dev Set the Livepeer link for a video
     * @param videoId ID of the video
     * @param livepeerLink Livepeer link to the video
     * Requirements:
     * - Caller must have OPERATOR_ROLE
     * - Video must exist
     */
    function setLivepeerLink(uint256 videoId, string memory livepeerLink) external onlyRole(OPERATOR_ROLE) {
        Video storage video = videos[videoId];
        require(video.id != 0, "Video does not exist");
        require(bytes(video.livepeerLink).length == 0, "Livepeer link already set");
        require(video.bridgeFee >= 0.001 ether, "Bridge fee not stored");
        
        video.livepeerLink = livepeerLink;
        
        // Now that we have the video link, register with Story Protocol
        registerWithStoryProtocol(videoId);
    }
    
    /**
     * @dev Set the IP ID for a video after registration with Story Protocol
     * @param videoId ID of the video
     * @param ipId ID of the IP asset on Story Protocol
     * Requirements:
     * - Caller must be the CrossChainBridge contract
     * - Video must exist
     */
    function setIPId(uint256 videoId, string memory ipId) external {
        require(msg.sender == crossChainBridge, "Only CrossChainBridge can set IP ID");
        Video storage video = videos[videoId];
        require(video.id != 0, "Video does not exist");
        
        video.ipId = ipId;
        emit VideoIPRegistered(videoId, ipId);
    }
}
