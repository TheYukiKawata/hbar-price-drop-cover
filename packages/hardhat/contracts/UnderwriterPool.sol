// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

abstract contract UnderwriterPool {
    uint256 public totalShares;
    uint256 public lockedCapital;
    mapping(address underwriter => uint256 shares) public sharesOf;

    event Deposited(address indexed underwriter, uint256 amount, uint256 shares);
    event Withdrawn(address indexed underwriter, uint256 amount, uint256 shares);

    error ZeroAmount();
    error InsufficientShares(uint256 requested, uint256 owned);
    error InsufficientFreeCapital(uint256 requested, uint256 available);
    error HbarTransferFailed(address recipient, uint256 amount);

    function deposit() external payable returns (uint256 shares) {
        if (msg.value == 0) revert ZeroAmount();
        uint256 assetsBeforeDeposit = totalAssets() - msg.value;
        shares = Math.mulDiv(msg.value, totalShares + 1, assetsBeforeDeposit + 1);
        sharesOf[msg.sender] += shares;
        totalShares += shares;
        emit Deposited(msg.sender, msg.value, shares);
    }

    function withdraw(uint256 shares) external returns (uint256 amount) {
        if (shares == 0) revert ZeroAmount();
        uint256 owned = sharesOf[msg.sender];
        if (shares > owned) revert InsufficientShares(shares, owned);
        amount = previewRedeem(shares);
        _requireFreeCapital(amount);
        sharesOf[msg.sender] = owned - shares;
        totalShares -= shares;
        emit Withdrawn(msg.sender, amount, shares);
        _sendHbar(msg.sender, amount);
    }

    function totalAssets() public view returns (uint256) {
        return address(this).balance;
    }

    function freeCapital() public view returns (uint256) {
        uint256 assets = totalAssets();
        return assets > lockedCapital ? assets - lockedCapital : 0;
    }

    function previewRedeem(uint256 shares) public view returns (uint256) {
        return Math.mulDiv(shares, totalAssets() + 1, totalShares + 1);
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

    function _sendHbar(address recipient, uint256 amount) internal {
        (bool sent, ) = recipient.call{ value: amount }("");
        if (!sent) revert HbarTransferFailed(recipient, amount);
    }

    function _requireFreeCapital(uint256 amount) private view {
        uint256 available = freeCapital();
        if (amount > available) revert InsufficientFreeCapital(amount, available);
    }
}
