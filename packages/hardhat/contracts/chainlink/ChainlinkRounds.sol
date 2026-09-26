// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { AggregatorV3Interface } from "./AggregatorV3Interface.sol";

library ChainlinkRounds {
    struct Round {
        uint80 id;
        int256 answer;
        uint256 updatedAt;
    }

    uint80 private constant AGGREGATOR_ROUND_MASK = type(uint64).max;

    error NoRoundFoundBefore(uint256 timestamp);
    error RoundNotLastBefore(uint80 roundId, uint256 timestamp);

    function latest(AggregatorV3Interface feed) internal view returns (Round memory) {
        (uint80 id, int256 answer, , uint256 updatedAt, ) = feed.latestRoundData();
        return Round(id, answer, updatedAt);
    }

    function lastRoundBefore(
        AggregatorV3Interface feed,
        uint256 timestamp,
        uint256 maxLookback
    ) internal view returns (Round memory round) {
        round = latest(feed);
        for (uint256 stepsBack = 0; round.updatedAt > timestamp; stepsBack++) {
            if (stepsBack == maxLookback || _isFirstInPhase(round.id)) revert NoRoundFoundBefore(timestamp);
            round = _round(feed, round.id - 1);
        }
    }

    function verifyLastRoundBefore(
        AggregatorV3Interface feed,
        uint256 timestamp,
        uint80 roundId
    ) internal view returns (Round memory round) {
        round = _round(feed, roundId);
        bool startsBefore = round.updatedAt != 0 && round.updatedAt <= timestamp;
        if (!startsBefore || !_nextRoundStartsAfter(feed, roundId, timestamp)) {
            revert RoundNotLastBefore(roundId, timestamp);
        }
    }

    function _nextRoundStartsAfter(
        AggregatorV3Interface feed,
        uint80 roundId,
        uint256 timestamp
    ) private view returns (bool) {
        if (latest(feed).id == roundId) return true;
        try feed.getRoundData(roundId + 1) returns (uint80, int256, uint256, uint256 nextUpdatedAt, uint80) {
            return nextUpdatedAt > timestamp;
        } catch {
            return false;
        }
    }

    function _round(AggregatorV3Interface feed, uint80 roundId) private view returns (Round memory) {
        (, int256 answer, , uint256 updatedAt, ) = feed.getRoundData(roundId);
        return Round(roundId, answer, updatedAt);
    }

    function _isFirstInPhase(uint80 roundId) private pure returns (bool) {
        return roundId & AGGREGATOR_ROUND_MASK <= 1;
    }
}
