// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { MockPolicyNft } from "./MockPolicyNft.sol";
import { PriceDropCover } from "../PriceDropCover.sol";

contract PolicyHolderWallet {
    bool public acceptsHbar;

    error HbarRefused();

    function associate(MockPolicyNft policyToken) external {
        policyToken.associate();
    }

    function setAcceptsHbar(bool accepts) external {
        acceptsHbar = accepts;
    }

    function claimPayout(PriceDropCover cover, uint256 policyId) external {
        cover.claimPayout(policyId);
    }

    receive() external payable {
        if (!acceptsHbar) revert HbarRefused();
    }
}
