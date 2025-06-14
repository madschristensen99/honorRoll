// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../interfaces/IHonorToken.sol";
import "../interfaces/IYieldManager.sol";

/**
 * @title VotingManager
 * @dev Manages voting on videos using HONOR token balance as voting weight
 */
contract VotingManager is AccessControl, ReentrancyGuard {
    // Constants
    uint256 public constant VOTING_PERIOD = 24 hours;
    
    // Vote data structures
    struct Choice {
        uint256 id;
        string description;
        uint256 voteCount;
    }
    
    struct Poll {
        uint256 videoId;
        uint256[] choiceIds;
        mapping(uint256 => Choice) choices;
        mapping(address => uint256) userVotes; // Maps user address to choice ID
        mapping(address => uint256) userWeights; // Maps user address to voting weight
        uint256 startTime;
        uint256 endTime;
        bool finalized;
        uint256 winningChoiceId;
        address[] voters;
    }
    
    // State variables
    IHonorToken public honorToken;
    IYieldManager public yieldManager;
    address public videoManager;
    
    // Polls storage
    mapping(uint256 => Poll) public polls; // Maps videoId to Poll
    
    // Events
    event PollCreated(uint256 indexed videoId, uint256 startTime, uint256 endTime);
    event VoteCast(uint256 indexed videoId, address indexed voter, uint256 choiceId, uint256 weight);
    event PollFinalized(uint256 indexed videoId, uint256 winningChoiceId);
    
    // Roles
    bytes32 public constant POLL_CREATOR_ROLE = keccak256("POLL_CREATOR_ROLE");
    bytes32 public constant POLL_FINALIZER_ROLE = keccak256("POLL_FINALIZER_ROLE");
    
    /**
     * @dev Constructor
     * @param _honorToken Address of the HONOR token contract
     * @param _yieldManager Address of the yield manager contract
     */
    constructor(
        address _honorToken,
        address _yieldManager
    ) {
        honorToken = IHonorToken(_honorToken);
        yieldManager = IYieldManager(_yieldManager);
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(POLL_CREATOR_ROLE, msg.sender);
        _grantRole(POLL_FINALIZER_ROLE, msg.sender);
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
     * @dev Create a new poll for a video
     * @param videoId ID of the video
     * @param choiceDescriptions Array of choice descriptions
     * Requirements:
     * - Caller must have POLL_CREATOR_ROLE
     * - Poll must not already exist for this video
     */
    function createPoll(
        uint256 videoId,
        string[] memory choiceDescriptions
    ) external onlyRole(POLL_CREATOR_ROLE) {
        require(polls[videoId].startTime == 0, "Poll already exists for this video");
        require(choiceDescriptions.length > 1, "Must have at least 2 choices");
        
        // Create poll
        Poll storage poll = polls[videoId];
        poll.videoId = videoId;
        poll.startTime = block.timestamp;
        poll.endTime = block.timestamp + VOTING_PERIOD;
        
        // Add choices
        for (uint256 i = 0; i < choiceDescriptions.length; i++) {
            uint256 choiceId = i + 1; // Choice IDs start from 1
            poll.choices[choiceId] = Choice({
                id: choiceId,
                description: choiceDescriptions[i],
                voteCount: 0
            });
            poll.choiceIds.push(choiceId);
        }
        
        emit PollCreated(videoId, poll.startTime, poll.endTime);
    }
    
    /**
     * @dev Cast a vote in a poll
     * @param videoId ID of the video
     * @param choiceId ID of the choice to vote for
     * Requirements:
     * - Poll must exist and be active
     * - Choice must exist
     * - User must not have already voted in this poll
     */
    function vote(uint256 videoId, uint256 choiceId) external nonReentrant {
        Poll storage poll = polls[videoId];
        
        require(poll.startTime > 0, "Poll does not exist");
        require(block.timestamp >= poll.startTime, "Poll has not started");
        require(block.timestamp <= poll.endTime, "Poll has ended");
        require(poll.choices[choiceId].id == choiceId, "Invalid choice");
        require(poll.userVotes[msg.sender] == 0, "Already voted");
        
        // Get user's HONOR balance as voting weight
        uint256 weight = honorToken.balanceOf(msg.sender);
        require(weight > 0, "No voting power");
        
        // Record vote
        poll.userVotes[msg.sender] = choiceId;
        poll.userWeights[msg.sender] = weight;
        poll.choices[choiceId].voteCount += weight;
        poll.voters.push(msg.sender);
        
        emit VoteCast(videoId, msg.sender, choiceId, weight);
    }
    
    /**
     * @dev Finalize a poll and determine the winning choice
     * @param videoId ID of the video
     * Requirements:
     * - Caller must have POLL_FINALIZER_ROLE
     * - Poll must exist and be ended
     * - Poll must not already be finalized
     */
    function finalizePoll(uint256 videoId) external onlyRole(POLL_FINALIZER_ROLE) nonReentrant {
        Poll storage poll = polls[videoId];
        
        require(poll.startTime > 0, "Poll does not exist");
        require(block.timestamp > poll.endTime, "Poll has not ended");
        require(!poll.finalized, "Poll already finalized");
        
        // Find winning choice
        uint256 winningChoiceId = 0;
        uint256 highestVoteCount = 0;
        
        for (uint256 i = 0; i < poll.choiceIds.length; i++) {
            uint256 choiceId = poll.choiceIds[i];
            if (poll.choices[choiceId].voteCount > highestVoteCount) {
                highestVoteCount = poll.choices[choiceId].voteCount;
                winningChoiceId = choiceId;
            }
        }
        
        // Set winning choice
        poll.winningChoiceId = winningChoiceId;
        poll.finalized = true;
        
        emit PollFinalized(videoId, winningChoiceId);
    }
    
    /**
     * @dev Distribute yield to winning voters
     * @param videoId ID of the video
     * @param sequelVideoId ID of the sequel video that triggered yield distribution
     * Requirements:
     * - Caller must have POLL_FINALIZER_ROLE
     * - Poll must exist and be finalized
     */
    /**
     * @dev Distribute yield to winning voters and previous creators
     * @param videoId ID of the video with the poll
     * @param sequelVideoId ID of the sequel video triggering distribution
     * Requirements:
     * - Caller must have POLL_FINALIZER_ROLE
     * - Poll must exist and be finalized
     * - Poll must have a winning choice
     */
    function distributeYield(uint256 videoId, uint256 sequelVideoId) external onlyRole(POLL_FINALIZER_ROLE) nonReentrant {
        Poll storage poll = polls[videoId];
        
        require(poll.startTime > 0, "Poll does not exist");
        require(poll.finalized, "Poll not finalized");
        require(poll.winningChoiceId > 0, "No winning choice");
        
        // Get winning voters and their weights
        address[] memory winningVoters = new address[](poll.voters.length);
        uint256[] memory voterWeights = new uint256[](poll.voters.length);
        
        uint256 winnerCount = 0;
        for (uint256 i = 0; i < poll.voters.length; i++) {
            address voter = poll.voters[i];
            if (poll.userVotes[voter] == poll.winningChoiceId) {
                winningVoters[winnerCount] = voter;
                voterWeights[winnerCount] = poll.userWeights[voter];
                winnerCount++;
            }
        }
        
        // Resize arrays to actual winner count
        assembly {
            mstore(winningVoters, winnerCount)
            mstore(voterWeights, winnerCount)
        }
        
        // Get previous creators from VideoManager
        require(videoManager != address(0), "VideoManager not set");
        
        // Call VideoManager to get previous creators
        (bool success, bytes memory data) = videoManager.call(
            abi.encodeWithSignature("getSequenceVideos(uint256)", videoId)
        );
        require(success, "Failed to get sequence videos");
        
        // Decode the returned video IDs
        uint256[] memory sequenceVideos = abi.decode(data, (uint256[]));
        
        // Get creators for each video
        address[] memory previousCreators = new address[](sequenceVideos.length);
        
        for (uint256 i = 0; i < sequenceVideos.length; i++) {
            (success, data) = videoManager.call(
                abi.encodeWithSignature("getVideo(uint256)", sequenceVideos[i])
            );
            require(success, "Failed to get video");
            
            // The first field in the Video struct is the ID, the second is the creator
            (,address creator,,,,,,,,,) = abi.decode(data, (uint256,address,uint256,bool,uint256,uint256,string,string,uint256,bool,string));
            previousCreators[i] = creator;
        }
        
        // Distribute yield through YieldManager
        yieldManager.distributeYield(
            sequelVideoId,
            previousCreators,
            winningVoters,
            voterWeights
        );
    }
    
    /**
     * @dev Get poll details
     * @param videoId ID of the video
     * @return startTime Poll start time
     * @return endTime Poll end time
     * @return finalized Whether the poll is finalized
     * @return winningChoiceId ID of the winning choice
     * @return choiceCount Number of choices
     */
    function getPollDetails(uint256 videoId) external view returns (
        uint256 startTime,
        uint256 endTime,
        bool finalized,
        uint256 winningChoiceId,
        uint256 choiceCount
    ) {
        Poll storage poll = polls[videoId];
        return (
            poll.startTime,
            poll.endTime,
            poll.finalized,
            poll.winningChoiceId,
            poll.choiceIds.length
        );
    }
    
    /**
     * @dev Get choice details
     * @param videoId ID of the video
     * @param choiceId ID of the choice
     * @return id Choice ID
     * @return description Choice description
     * @return voteCount Number of votes for this choice
     */
    function getChoiceDetails(uint256 videoId, uint256 choiceId) external view returns (
        uint256 id,
        string memory description,
        uint256 voteCount
    ) {
        Poll storage poll = polls[videoId];
        Choice storage choice = poll.choices[choiceId];
        return (
            choice.id,
            choice.description,
            choice.voteCount
        );
    }
    
    /**
     * @dev Get user vote in a poll
     * @param videoId ID of the video
     * @param voter Address of the voter
     * @return choiceId ID of the choice voted for (0 if not voted)
     * @return weight Voting weight used
     */
    function getUserVote(uint256 videoId, address voter) external view returns (
        uint256 choiceId,
        uint256 weight
    ) {
        Poll storage poll = polls[videoId];
        return (
            poll.userVotes[voter],
            poll.userWeights[voter]
        );
    }
}
