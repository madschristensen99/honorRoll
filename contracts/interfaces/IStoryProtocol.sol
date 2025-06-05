// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IStoryProtocol
 * @dev Interface for the Story Protocol integration
 */
interface IStoryProtocol {
    /**
     * @dev Register a new IP asset
     * @param creator Address of the creator
     * @param ipfsHash IPFS hash of the content
     * @param isOriginal Whether this is an original work or a derivative
     * @param parentIpId ID of the parent IP (if derivative)
     * @return ipId The ID of the registered IP asset
     */
    function registerIpAsset(
        address creator,
        string calldata ipfsHash,
        bool isOriginal,
        string calldata parentIpId
    ) external returns (string memory ipId);

    /**
     * @dev Set royalty information for an IP asset
     * @param ipId ID of the IP asset
     * @param recipients Array of royalty recipients
     * @param bps Array of basis points for each recipient (100 = 1%)
     */
    function setRoyaltyInfo(
        string calldata ipId,
        address[] calldata recipients,
        uint256[] calldata bps
    ) external;

    /**
     * @dev Transfer ownership of an IP asset
     * @param ipId ID of the IP asset
     * @param newOwner Address of the new owner
     */
    function transferIpOwnership(
        string calldata ipId,
        address newOwner
    ) external;

    /**
     * @dev Get the owner of an IP asset
     * @param ipId ID of the IP asset
     * @return owner Address of the owner
     */
    function getIpOwner(string calldata ipId) external view returns (address owner);
}
