// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IHederaTokenService } from "../hedera/IHederaTokenService.sol";
import { MockPolicyNft } from "./MockPolicyNft.sol";

contract MockHederaTokenService is IHederaTokenService {
    int64 private constant SUCCESS = 22;
    int64 private constant INSUFFICIENT_TX_FEE = 9;
    int64 private constant INVALID_SIGNATURE = 7;
    int64 private constant SENDER_DOES_NOT_OWN_NFT_SERIAL_NO = 237;
    int64 private constant TOKEN_NOT_ASSOCIATED_TO_ACCOUNT = 184;
    uint256 private constant SUPPLY_KEY = 16;

    uint256 public constant CREATION_FEE = 10 ether;

    mapping(address token => address supplyKeyContract) public supplyKeyOf;

    function createNonFungibleToken(
        HederaToken memory token
    ) external payable returns (int64 responseCode, address tokenAddress) {
        if (msg.value < CREATION_FEE) return (INSUFFICIENT_TX_FEE, address(0));

        MockPolicyNft nft = new MockPolicyNft(token.name, token.symbol, token.treasury);
        supplyKeyOf[address(nft)] = _supplyKeyContract(token.tokenKeys);
        return (SUCCESS, address(nft));
    }

    function mintToken(
        address token,
        int64,
        bytes[] memory metadata
    ) external returns (int64 responseCode, int64 newTotalSupply, int64[] memory serialNumbers) {
        if (msg.sender != supplyKeyOf[token]) return (INVALID_SIGNATURE, 0, new int64[](0));

        serialNumbers = new int64[](metadata.length);
        for (uint256 i = 0; i < metadata.length; i++) {
            serialNumbers[i] = int64(uint64(MockPolicyNft(token).mintToTreasury()));
        }
        return (SUCCESS, int64(uint64(MockPolicyNft(token).lastSerialNumber())), serialNumbers);
    }

    function transferNFT(
        address token,
        address sender,
        address recipient,
        int64 serialNumber
    ) external returns (int64 responseCode) {
        MockPolicyNft nft = MockPolicyNft(token);
        uint256 serial = uint256(uint64(serialNumber));
        if (sender != msg.sender || nft.ownerOf(serial) != sender) return SENDER_DOES_NOT_OWN_NFT_SERIAL_NO;
        if (!nft.isAssociated(recipient)) return TOKEN_NOT_ASSOCIATED_TO_ACCOUNT;

        nft.move(sender, recipient, serial);
        return SUCCESS;
    }

    function _supplyKeyContract(TokenKey[] memory keys) private pure returns (address) {
        for (uint256 i = 0; i < keys.length; i++) {
            if (keys[i].keyType & SUPPLY_KEY != 0) return keys[i].key.contractId;
        }
        return address(0);
    }
}
