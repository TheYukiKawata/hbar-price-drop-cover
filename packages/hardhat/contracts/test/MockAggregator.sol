// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { AggregatorV3Interface } from "../chainlink/AggregatorV3Interface.sol";

contract MockAggregator is AggregatorV3Interface {
    struct RoundData {
        int256 answer;
        uint256 updatedAt;
    }

    uint80 private constant FIRST_ROUND_OF_PHASE_ONE = (uint80(1) << 64) + 1;

    uint8 public immutable decimals;
    uint80 public latestRoundId;
    uint80 private nextRoundId = FIRST_ROUND_OF_PHASE_ONE;
    mapping(uint80 roundId => RoundData) private rounds;

    constructor(uint8 decimals_) {
        decimals = decimals_;
    }

    function description() external pure returns (string memory) {
        return "HBAR / USD";
    }

    function pushRound(int256 answer, uint256 updatedAt) external returns (uint80 roundId) {
        roundId = nextRoundId;
        rounds[roundId] = RoundData(answer, updatedAt);
        latestRoundId = roundId;
        nextRoundId = roundId + 1;
    }

    function startNextPhase() external {
        uint80 nextPhaseId = (latestRoundId >> 64) + 1;
        nextRoundId = (nextPhaseId << 64) | 1;
    }

    function pushEmptyRound() external {
        latestRoundId = nextRoundId;
        nextRoundId = latestRoundId + 1;
    }

    function getRoundData(uint80 roundId) public view returns (uint80, int256, uint256, uint256, uint80) {
        RoundData memory round = rounds[roundId];
        return (roundId, round.answer, round.updatedAt, round.updatedAt, roundId);
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return getRoundData(latestRoundId);
    }
}
