// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract Dreamscroll is ERC721, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _movieIds;
    Counters.Counter private _seriesIds;

    struct Movie {
        string prompt;
        string link;
        address creator;
        uint256 seriesId;
        uint256 sequenceNumber;
        uint256 likes;
    }

    struct Comment {
        address commenter;
        string content;
        uint256 timestamp;
    }

    struct Series {
        string name;
        address creator;
        uint256[] movieIds;
        mapping(uint256 => string[]) userChoices;
        bool isActive;
    }

    mapping(uint256 => Movie) public movies;
    mapping(uint256 => Series) public series;
    mapping(address => uint256[]) public creatorMovies;
    mapping(uint256 => Comment[]) public movieComments;
    mapping(uint256 => mapping(address => bool)) public hasLiked;
    
    // New mappings for video tracking
    mapping(address => uint256[]) public videosSeenByUser;
    mapping(address => mapping(uint256 => bool)) public hasSeenVideo;

    event MovieCreated(uint256 indexed movieId, address creator, string prompt, uint256 seriesId, uint256 sequenceNumber);
    event MovieLinkUpdated(uint256 indexed movieId, string newLink);
    event SeriesCreated(uint256 indexed seriesId, address creator, string name);
    event UserChoiceMade(uint256 indexed seriesId, uint256 sequenceNumber, string choice);
    event SeriesEnded(uint256 indexed seriesId);
    event MovieLiked(uint256 indexed movieId, address liker);
    event CommentAdded(uint256 indexed movieId, address commenter, string content);
    event VideoSeen(uint256 indexed movieId, address viewer);

    constructor() ERC721("Dreamscroll", "DREAM") Ownable(msg.sender) {}

    function createSeries(string memory name) public returns (uint256) {
        uint256 newSeriesId = _seriesIds.current();
        Series storage newSeries = series[newSeriesId];
        newSeries.name = name;
        newSeries.creator = msg.sender;
        newSeries.isActive = true;
        emit SeriesCreated(newSeriesId, msg.sender, name);
        _seriesIds.increment();
        return newSeriesId;
    }

    function createMovie(string memory prompt, uint256 seriesId) public returns (uint256) {
        require(seriesId == type(uint256).max || series[seriesId].creator == msg.sender, "Not series creator");
        require(seriesId == type(uint256).max || series[seriesId].isActive, "Series is not active");
        
        uint256 newMovieId = _movieIds.current();
        uint256 sequenceNumber = 0;

        if (seriesId != type(uint256).max) {
            sequenceNumber = series[seriesId].movieIds.length;
            series[seriesId].movieIds.push(newMovieId);
        }

        _safeMint(msg.sender, newMovieId);

        movies[newMovieId] = Movie(prompt, "", msg.sender, seriesId, sequenceNumber, 0);
        creatorMovies[msg.sender].push(newMovieId);
        
        emit MovieCreated(newMovieId, msg.sender, prompt, seriesId, sequenceNumber);

        _movieIds.increment();
        return newMovieId;
    }

    function updateMovieLink(uint256 movieId, string memory newLink) public onlyOwner {
        require(_exists(movieId), "Movie does not exist");
        movies[movieId].link = newLink;
        emit MovieLinkUpdated(movieId, newLink);
    }

    function makeUserChoice(uint256 seriesId, string memory choice, uint256 sequenceNumber) public {
        require(series[seriesId].creator == msg.sender, "Not series creator");
        require(series[seriesId].isActive, "Series is not active");
        require(series[seriesId].movieIds.length > 0, "No movies in the series");

        uint256 latestSequenceNumber = series[seriesId].movieIds.length - 1;
    
        if (sequenceNumber == 0 && latestSequenceNumber > 0) {
            sequenceNumber = latestSequenceNumber;
        }

        require(sequenceNumber <= latestSequenceNumber, "Invalid sequence number");

        series[seriesId].userChoices[sequenceNumber].push(choice);
        emit UserChoiceMade(seriesId, sequenceNumber, choice);
    }

    function endSeries(uint256 seriesId) public {
        require(series[seriesId].creator == msg.sender, "Not series creator");
        require(series[seriesId].isActive, "Series is already ended");
        series[seriesId].isActive = false;
        emit SeriesEnded(seriesId);
    }

    function likeMovie(uint256 movieId) public {
        require(_exists(movieId), "Movie does not exist");
        require(!hasLiked[movieId][msg.sender], "Already liked this movie");
        
        movies[movieId].likes++;
        hasLiked[movieId][msg.sender] = true;
        emit MovieLiked(movieId, msg.sender);
    }

    function addComment(uint256 movieId, string memory content) public {
        require(_exists(movieId), "Movie does not exist");
        require(bytes(content).length > 0, "Comment cannot be empty");
        
        Comment memory newComment = Comment({
            commenter: msg.sender,
            content: content,
            timestamp: block.timestamp
        });
        
        movieComments[movieId].push(newComment);
        emit CommentAdded(movieId, msg.sender, content);
    }

    function getMovie(uint256 movieId) public view returns (string memory, string memory, address, uint256, uint256, uint256) {
        require(_exists(movieId), "Movie does not exist");
        Movie storage movie = movies[movieId];
        return (movie.prompt, movie.link, movie.creator, movie.seriesId, movie.sequenceNumber, movie.likes);
    }

    function getSeriesMovies(uint256 seriesId) public view returns (uint256[] memory) {
        return series[seriesId].movieIds;
    }

    function getUserChoices(uint256 seriesId, uint256 sequenceNumber) public view returns (string[] memory) {
        return series[seriesId].userChoices[sequenceNumber];
    }

    function getCreatorMovies(address creator) public view returns (uint256[] memory) {
        return creatorMovies[creator];
    }

    function isSeriesActive(uint256 seriesId) public view returns (bool) {
        return series[seriesId].isActive;
    }

    function getMovieLikes(uint256 movieId) public view returns (uint256) {
        require(_exists(movieId), "Movie does not exist");
        return movies[movieId].likes;
    }

    function getMovieComments(uint256 movieId) public view returns (Comment[] memory) {
        require(_exists(movieId), "Movie does not exist");
        return movieComments[movieId];
    }

    // New function to mark a video as seen by a user
    function markVideoAsSeen(uint256 movieId) public {
        require(_exists(movieId), "Movie does not exist");
        require(!hasSeenVideo[msg.sender][movieId], "Video already marked as seen");

        videosSeenByUser[msg.sender].push(movieId);
        hasSeenVideo[msg.sender][movieId] = true;
        emit VideoSeen(movieId, msg.sender);
    }

    // New function to get all videos seen by a user
    function getVideosSeenByUser(address user) public view returns (uint256[] memory) {
        return videosSeenByUser[user];
    }

    // New function to check if a user has seen a specific video
    function hasUserSeenVideo(address user, uint256 movieId) public view returns (bool) {
        return hasSeenVideo[user][movieId];
    }

    function _exists(uint256 tokenId) internal view override returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }
}
