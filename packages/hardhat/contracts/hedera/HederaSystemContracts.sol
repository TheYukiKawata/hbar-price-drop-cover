// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IHederaScheduleService } from "./IHederaScheduleService.sol";
import { IHederaTokenService } from "./IHederaTokenService.sol";

IHederaTokenService constant HTS = IHederaTokenService(0x0000000000000000000000000000000000000167);
IHederaScheduleService constant HSS = IHederaScheduleService(0x000000000000000000000000000000000000016B);

int64 constant HEDERA_SUCCESS = 22;
