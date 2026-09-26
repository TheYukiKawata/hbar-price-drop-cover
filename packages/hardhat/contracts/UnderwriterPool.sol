// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

abstract contract UnderwriterPool {
    uint256 public totalShares;
    uint256 public lockedCapital;
    uint256 public unclaimedPayouts;
    mapping(address underwriter => uint256 shares) public sharesOf;

    event Deposited(address indexed underwriter, uint256 amount, uint256 shares);
    event Withdrawn(address indexed underwriter, uint256 amount, uint256 shares);

    error ZeroAmount();
    error ZeroShares(uint256 amount);
    error InsufficientShares(uint256 requested, uint256 owned);
    error InsufficientFreeCapital(uint256 requested, uint256 available);
    error HbarTransferFailed(address recipient, uint256 amount);

    function deposit() external payable returns (uint256 shares) {
        if (msg.value == 0) revert ZeroAmount();
        uint256 assetsBeforeDeposit = _saturatingSub(totalAssets(), msg.value);
        shares = Math.mulDiv(msg.value, totalShares + 1, assetsBeforeDeposit + 1);
        if (shares == 0) revert ZeroShares(msg.value);
        sharesOf[msg.sender] += shares;
        totalShares += shares;
        emit Deposited(msg.sender, msg.value, shares);
    }

    function withdraw(uint256 shares) external returns (uint256 amount) {
        if (shares == 0) revert ZeroAmount();
        uint256 owned = sharesOf[msg.sender];
        if (shares > owned) revert InsufficientShares(shares, owned);
        amount = previewRedeem(shares);
        if (amount == 0) revert ZeroAmount();
        sharesOf[msg.sender] = owned - shares;
        totalShares -= shares;
        emit Withdrawn(msg.sender, amount, shares);
        _sendHbar(msg.sender, amount);
    }

    function totalAssets() public view returns (uint256) {
        return _saturatingSub(address(this).balance, unclaimedPayouts);
    }

    function freeCapital() public view returns (uint256) {
        return _saturatingSub(totalAssets(), lockedCapital);
    }

    function previewRedeem(uint256 shares) public view returns (uint256) {
        return Math.mulDiv(shares, freeCapital() + 1, totalShares + 1);
    }

    function assetsOf(address underwriter) external view returns (uint256) {
        return previewRedeem(sharesOf[underwriter]);
    }

    function _lockCapital(uint256 amount) internal {
        _requireFreeCapital(amount);
        lockedCapital += amount;
    }

    function _unlockCapital(uint256 amount) internal {
        lockedCapital -= amount;
    }

    function _holdUnclaimedPayout(uint256 amount) internal {
        unclaimedPayouts += amount;
    }

    function _releaseUnclaimedPayout(uint256 amount) internal {
        unclaimedPayouts -= amount;
    }

    function _sendHbar(address recipient, uint256 amount) internal {
        (bool sent, ) = recipient.call{ value: amount }("");
        if (!sent) revert HbarTransferFailed(recipient, amount);
    }

    function _saturatingSub(uint256 minuend, uint256 subtrahend) private pure returns (uint256) {
        return minuend > subtrahend ? minuend - subtrahend : 0;
    }

    function _requireFreeCapital(uint256 amount) private view {
        uint256 available = freeCapital();
        if (amount > available) revert InsufficientFreeCapital(amount, available);
    }
}
