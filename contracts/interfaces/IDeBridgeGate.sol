// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IDeBridgeGate
 * @dev Interface for the deBridge gate contract
 */
interface IDeBridgeGate {
    struct SubmissionAutoParamsTo {
        uint256 executionFee;
        uint256 flags;
        bytes fallbackAddress;
        bytes data;
    }

    /**
     * @dev Send a cross-chain message with automatic execution
     * @param dstChainId Destination chain ID
     * @param receiver Receiver address on the destination chain
     * @param message Message to be sent
     * @param autoParams Parameters for automatic execution
     * @return submissionId ID of the submission
     */
    function sendAutoMessage(
        uint256 dstChainId,
        bytes calldata receiver,
        bytes calldata message,
        SubmissionAutoParamsTo calldata autoParams
    ) external payable returns (bytes32 submissionId);
}
