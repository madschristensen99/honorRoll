// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract StarForge is ERC721, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _movieIds;

    struct Movie {
        string prompt;
        string link;
        address creator;
    }

    mapping(uint256 => Movie) public movies;

    event MovieCreated(uint256 indexed movieId, address creator, string prompt);
    event MovieLinkUpdated(uint256 indexed movieId, string newLink);

    constructor() ERC721("StarForge", "STAR") Ownable(msg.sender) {}

    function createMovie(string memory prompt) public returns (uint256) {
        _movieIds.increment();
        uint256 newMovieId = _movieIds.current();
        _safeMint(msg.sender, newMovieId);

        movies[newMovieId] = Movie(prompt, "", msg.sender);
        emit MovieCreated(newMovieId, msg.sender, prompt);

        return newMovieId;
    }

    function updateMovieLink(uint256 movieId, string memory newLink) public onlyOwner {
        require(_exists(movieId), "Movie does not exist");
        movies[movieId].link = newLink;
        emit MovieLinkUpdated(movieId, newLink);
    }

    function getMovie(uint256 movieId) public view returns (string memory, string memory, address) {
        require(_exists(movieId), "Movie does not exist");
        Movie storage movie = movies[movieId];
        return (movie.prompt, movie.link, movie.creator);
    }

    function getAllMovies() public view returns (Movie[] memory) {
        Movie[] memory allMovies = new Movie[](_movieIds.current());
        for (uint256 i = 1; i <= _movieIds.current(); i++) {
            allMovies[i - 1] = movies[i];
        }
        return allMovies;
    }

    function _exists(uint256 tokenId) internal view override returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }
}
