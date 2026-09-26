// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract MockPolicyNft is ERC721 {
    address public immutable tokenService;
    address public immutable treasury;
    uint256 public lastSerialNumber;
    mapping(address account => bool) public isAssociated;

    error OnlyTokenService();
    error NotAssociated(address account);

    constructor(string memory name, string memory symbol, address treasury_) ERC721(name, symbol) {
        tokenService = msg.sender;
        treasury = treasury_;
        isAssociated[treasury_] = true;
    }

    modifier onlyTokenService() {
        if (msg.sender != tokenService) revert OnlyTokenService();
        _;
    }

    function associate() external returns (int64) {
        isAssociated[msg.sender] = true;
        return 22;
    }

    function mintToTreasury() external onlyTokenService returns (uint256 serialNumber) {
        serialNumber = ++lastSerialNumber;
        _mint(treasury, serialNumber);
    }

    function move(address from, address to, uint256 serialNumber) external onlyTokenService {
        _transfer(from, to, serialNumber);
    }

    function _update(address to, uint256 serialNumber, address auth) internal override returns (address) {
        if (to != address(0) && !isAssociated[to]) revert NotAssociated(to);
        return super._update(to, serialNumber, auth);
    }
}
