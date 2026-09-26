// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { AggregatorV3Interface } from "./chainlink/AggregatorV3Interface.sol";
import { ChainlinkRounds } from "./chainlink/ChainlinkRounds.sol";
import { HEDERA_SUCCESS, HSS, HTS } from "./hedera/HederaSystemContracts.sol";
import { IHederaTokenService } from "./hedera/IHederaTokenService.sol";
import { UnderwriterPool } from "./UnderwriterPool.sol";

contract PriceDropCover is UnderwriterPool {
    enum PolicyStatus {
        None,
        Active,
        PaidOut,
        Expired,
        Voided
    }

    struct Policy {
        uint128 payout;
        uint128 premium;
        int256 strikePrice;
        uint64 expiry;
        PolicyStatus status;
        address resolutionSchedule;
    }

    struct CoverTerms {
        AggregatorV3Interface priceFeed;
        uint256 triggerDropBps;
        uint256 premiumBps;
        uint256 coverPeriod;
        uint256 maxPriceAge;
        uint256 resolutionGasLimit;
        uint256 resolutionFee;
    }

    uint256 private constant BPS = 10_000;
    uint256 private constant MAX_ROUND_LOOKBACK = 24;
    uint256 private constant MAX_SCHEDULE_DELAY = 30;
    uint256 private constant PAYOUT_GAS_LIMIT = 50_000;
    uint256 public constant UNRESOLVED_VOID_DELAY = 7 days;
    uint256 private constant SUPPLY_KEY = 16;
    int64 private constant POLICY_TOKEN_AUTO_RENEW_PERIOD = 7_776_000;
    bytes private constant POLICY_METADATA = "HBAR price-drop cover";

    AggregatorV3Interface public immutable priceFeed;
    uint256 public immutable triggerDropBps;
    uint256 public immutable premiumBps;
    uint256 public immutable coverPeriod;
    uint256 public immutable maxPriceAge;
    uint256 public immutable resolutionGasLimit;
    uint256 public immutable resolutionFee;

    address public policyToken;
    mapping(uint256 policyId => Policy) public policies;
    mapping(uint256 policyId => uint256 amount) public unclaimedPayoutOf;

    event PolicyTokenCreated(address indexed token);
    event CoverBought(
        uint256 indexed policyId,
        address indexed holder,
        uint256 payout,
        uint256 premium,
        int256 strikePrice,
        uint256 expiry,
        address resolutionSchedule
    );
    event PolicyResolved(
        uint256 indexed policyId,
        PolicyStatus indexed outcome,
        uint80 roundId,
        int256 priceAtExpiry,
        address holder,
        uint256 amountPaid
    );
    event PayoutUnclaimed(uint256 indexed policyId, address indexed holder, uint256 amount);
    event PayoutClaimed(uint256 indexed policyId, address indexed holder, uint256 amount);

    error InvalidTerms();
    error PolicyTokenAlreadyCreated(address token);
    error PolicyTokenNotCreated();
    error HederaCallFailed(string operation, int64 responseCode);
    error StalePrice(uint256 updatedAt);
    error InvalidPrice(int256 answer);
    error WrongPayment(uint256 expected, uint256 received);
    error NoScheduleCapacity(uint256 expiry);
    error PolicyNotActive(uint256 policyId);
    error CoverNotExpired(uint256 policyId, uint256 expiry);
    error VoidTooEarly(uint256 policyId, uint256 voidableAt);
    error NothingToClaim(uint256 policyId);
    error NotPolicyHolder(uint256 policyId, address holder);

    constructor(CoverTerms memory terms) {
        bool validBps = terms.triggerDropBps > 0 &&
            terms.triggerDropBps < BPS &&
            terms.premiumBps > 0 &&
            terms.premiumBps < BPS;
        bool validDurations = terms.coverPeriod > 0 && terms.maxPriceAge > 0 && terms.resolutionGasLimit > 0;
        if (address(terms.priceFeed) == address(0) || !validBps || !validDurations) revert InvalidTerms();

        priceFeed = terms.priceFeed;
        triggerDropBps = terms.triggerDropBps;
        premiumBps = terms.premiumBps;
        coverPeriod = terms.coverPeriod;
        maxPriceAge = terms.maxPriceAge;
        resolutionGasLimit = terms.resolutionGasLimit;
        resolutionFee = terms.resolutionFee;
    }

    function createPolicyToken() external payable {
        if (policyToken != address(0)) revert PolicyTokenAlreadyCreated(policyToken);
        uint256 balanceBeforeFee = address(this).balance - msg.value;

        (int64 responseCode, address token) = HTS.createNonFungibleToken{ value: msg.value }(_policyTokenDefinition());
        if (responseCode != HEDERA_SUCCESS) revert HederaCallFailed("createNonFungibleToken", responseCode);

        policyToken = token;
        emit PolicyTokenCreated(token);

        uint256 unusedFee = address(this).balance - balanceBeforeFee;
        if (unusedFee > 0) _sendHbar(msg.sender, unusedFee);
    }

    function quote(uint256 payout) public view returns (uint256 premium, int256 strikePrice) {
        premium = Math.mulDiv(payout, premiumBps, BPS, Math.Rounding.Ceil);
        strikePrice = (_freshPrice() * int256(BPS - triggerDropBps)) / int256(BPS);
    }

    function buyCover(uint256 payout) external payable returns (uint256 policyId) {
        if (policyToken == address(0)) revert PolicyTokenNotCreated();
        if (payout == 0) revert ZeroAmount();

        (uint256 premium, int256 strikePrice) = quote(payout);
        uint256 price = premium + resolutionFee;
        if (msg.value != price) revert WrongPayment(price, msg.value);
        _lockCapital(payout);

        uint256 expiry = block.timestamp + coverPeriod;
        policyId = _mintPolicyTo(msg.sender);
        address resolutionSchedule = _scheduleResolution(policyId, expiry);

        policies[policyId] = Policy({
            payout: uint128(payout),
            premium: uint128(premium),
            strikePrice: strikePrice,
            expiry: uint64(expiry),
            status: PolicyStatus.Active,
            resolutionSchedule: resolutionSchedule
        });
        emit CoverBought(policyId, msg.sender, payout, premium, strikePrice, expiry, resolutionSchedule);
    }

    function resolve(uint256 policyId) external {
        Policy storage policy = _expiredActivePolicy(policyId);
        _resolve(policyId, policy, ChainlinkRounds.lastRoundBefore(priceFeed, policy.expiry, MAX_ROUND_LOOKBACK));
    }

    function resolveWithRound(uint256 policyId, uint80 roundId) external {
        Policy storage policy = _expiredActivePolicy(policyId);
        _resolve(policyId, policy, ChainlinkRounds.verifyLastRoundBefore(priceFeed, policy.expiry, roundId));
    }

    function voidUnresolved(uint256 policyId) external {
        Policy storage policy = _expiredActivePolicy(policyId);
        uint256 voidableAt = policy.expiry + UNRESOLVED_VOID_DELAY;
        if (block.timestamp < voidableAt) revert VoidTooEarly(policyId, voidableAt);
        _settle(policyId, policy, PolicyStatus.Voided, policy.premium, ChainlinkRounds.Round(0, 0, 0));
    }

    function claimPayout(uint256 policyId) external {
        uint256 amount = unclaimedPayoutOf[policyId];
        if (amount == 0) revert NothingToClaim(policyId);
        address holder = IERC721(policyToken).ownerOf(policyId);
        if (msg.sender != holder) revert NotPolicyHolder(policyId, holder);

        unclaimedPayoutOf[policyId] = 0;
        _releaseUnclaimedPayout(amount);
        emit PayoutClaimed(policyId, holder, amount);
        _sendHbar(holder, amount);
    }

    function _resolve(uint256 policyId, Policy storage policy, ChainlinkRounds.Round memory round) private {
        (PolicyStatus outcome, uint256 amountPaid) = _outcome(policy, round);
        _settle(policyId, policy, outcome, amountPaid, round);
    }

    function _settle(
        uint256 policyId,
        Policy storage policy,
        PolicyStatus outcome,
        uint256 amountPaid,
        ChainlinkRounds.Round memory round
    ) private {
        address holder = IERC721(policyToken).ownerOf(policyId);
        policy.status = outcome;
        _unlockCapital(policy.payout);
        emit PolicyResolved(policyId, outcome, round.id, round.answer, holder, amountPaid);

        if (amountPaid > 0) _payHolder(policyId, holder, amountPaid);
    }

    function _payHolder(uint256 policyId, address holder, uint256 amount) private {
        (bool sent, ) = holder.call{ value: amount, gas: PAYOUT_GAS_LIMIT }("");
        if (sent) return;

        unclaimedPayoutOf[policyId] = amount;
        _holdUnclaimedPayout(amount);
        emit PayoutUnclaimed(policyId, holder, amount);
    }

    function _outcome(
        Policy storage policy,
        ChainlinkRounds.Round memory round
    ) private view returns (PolicyStatus outcome, uint256 amountPaid) {
        if (policy.expiry - round.updatedAt > maxPriceAge) return (PolicyStatus.Voided, policy.premium);
        if (round.answer <= 0) return (PolicyStatus.Voided, policy.premium);
        if (round.answer < policy.strikePrice) return (PolicyStatus.PaidOut, policy.payout);
        return (PolicyStatus.Expired, 0);
    }

    function _expiredActivePolicy(uint256 policyId) private view returns (Policy storage policy) {
        policy = policies[policyId];
        if (policy.status != PolicyStatus.Active) revert PolicyNotActive(policyId);
        if (block.timestamp < policy.expiry) revert CoverNotExpired(policyId, policy.expiry);
    }

    function _freshPrice() private view returns (int256) {
        ChainlinkRounds.Round memory round = ChainlinkRounds.latest(priceFeed);
        if (round.answer <= 0) revert InvalidPrice(round.answer);
        if (block.timestamp - round.updatedAt > maxPriceAge) revert StalePrice(round.updatedAt);
        return round.answer;
    }

    function _mintPolicyTo(address holder) private returns (uint256 policyId) {
        bytes[] memory metadata = new bytes[](1);
        metadata[0] = POLICY_METADATA;
        (int64 mintCode, , int64[] memory serialNumbers) = HTS.mintToken(policyToken, 0, metadata);
        if (mintCode != HEDERA_SUCCESS) revert HederaCallFailed("mintToken", mintCode);

        int64 serialNumber = serialNumbers[0];
        int64 transferCode = HTS.transferNFT(policyToken, address(this), holder, serialNumber);
        if (transferCode != HEDERA_SUCCESS) revert HederaCallFailed("transferNFT", transferCode);

        return uint256(uint64(serialNumber));
    }

    function _scheduleResolution(uint256 policyId, uint256 expiry) private returns (address schedule) {
        uint256 executionSecond = _firstSecondWithCapacity(expiry);
        bytes memory resolveCall = abi.encodeCall(this.resolve, (policyId));
        (int64 responseCode, address scheduleAddress) = HSS.scheduleCall(
            address(this),
            executionSecond,
            resolutionGasLimit,
            0,
            resolveCall
        );
        if (responseCode != HEDERA_SUCCESS) revert HederaCallFailed("scheduleCall", responseCode);
        return scheduleAddress;
    }

    function _firstSecondWithCapacity(uint256 expiry) private view returns (uint256) {
        for (uint256 second = expiry; second <= expiry + MAX_SCHEDULE_DELAY; second++) {
            if (HSS.hasScheduleCapacity(second, resolutionGasLimit)) return second;
        }
        revert NoScheduleCapacity(expiry);
    }

    function _policyTokenDefinition() private view returns (IHederaTokenService.HederaToken memory token) {
        IHederaTokenService.TokenKey[] memory keys = new IHederaTokenService.TokenKey[](1);
        keys[0] = IHederaTokenService.TokenKey({
            keyType: SUPPLY_KEY,
            key: IHederaTokenService.KeyValue({
                inheritAccountKey: false,
                contractId: address(this),
                ed25519: "",
                ECDSA_secp256k1: "",
                delegatableContractId: address(0)
            })
        });

        token.name = "HBAR Price-Drop Cover";
        token.symbol = "HCOVER";
        token.treasury = address(this);
        token.memo = "Policy NFTs issued by PriceDropCover";
        token.tokenKeys = keys;
        token.expiry = IHederaTokenService.Expiry({
            second: 0,
            autoRenewAccount: address(this),
            autoRenewPeriod: POLICY_TOKEN_AUTO_RENEW_PERIOD
        });
    }
}
