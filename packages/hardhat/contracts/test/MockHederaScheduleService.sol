// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IHederaScheduleService } from "../hedera/IHederaScheduleService.sol";

contract MockHederaScheduleService is IHederaScheduleService {
    struct ScheduledCall {
        address to;
        uint256 expirySecond;
        uint256 gasLimit;
        bytes callData;
    }

    int64 private constant SUCCESS = 22;
    uint160 private constant FIRST_SCHEDULE_ADDRESS = 0x5c4ed000;

    ScheduledCall[] public scheduledCalls;
    mapping(uint256 second => bool) public isSecondFull;

    function markSecondFull(uint256 second) external {
        isSecondFull[second] = true;
    }

    function scheduleCall(
        address to,
        uint256 expirySecond,
        uint256 gasLimit,
        uint64,
        bytes memory callData
    ) external returns (int64 responseCode, address scheduleAddress) {
        scheduledCalls.push(ScheduledCall(to, expirySecond, gasLimit, callData));
        return (SUCCESS, address(FIRST_SCHEDULE_ADDRESS + uint160(scheduledCalls.length)));
    }

    function hasScheduleCapacity(uint256 expirySecond, uint256) external view returns (bool) {
        return !isSecondFull[expirySecond];
    }

    function scheduledCallCount() external view returns (uint256) {
        return scheduledCalls.length;
    }

    function execute(uint256 index) external {
        ScheduledCall memory scheduled = scheduledCalls[index];
        (bool succeeded, bytes memory returnData) = scheduled.to.call{ gas: scheduled.gasLimit }(scheduled.callData);
        if (!succeeded) {
            assembly {
                revert(add(returnData, 32), mload(returnData))
            }
        }
    }
}
