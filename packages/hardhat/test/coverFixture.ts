import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, network } from "hardhat";
import { MockHederaScheduleService, MockPolicyNft, PriceDropCover } from "../typechain-types";

const HTS_ADDRESS = "0x0000000000000000000000000000000000000167";
const HSS_ADDRESS = "0x000000000000000000000000000000000000016B";

export const PRICE_DECIMALS = 8;
export const OPENING_PRICE = ethers.parseUnits("0.10", PRICE_DECIMALS);
export const TRIGGER_DROP_BPS = 1_000n;
export const PREMIUM_BPS = 500n;
export const COVER_PERIOD = 7n * 24n * 60n * 60n;
export const MAX_PRICE_AGE = 2n * 60n * 60n;
export const RESOLUTION_GAS_LIMIT = 400_000n;
export const RESOLUTION_FEE = ethers.parseEther("0.5");
export const TOKEN_CREATION_FEE = ethers.parseEther("10");
export const POOL_DEPOSIT = ethers.parseEther("1000");
export const PAYOUT = ethers.parseEther("100");

export const PolicyStatus = { None: 0n, Active: 1n, PaidOut: 2n, Expired: 3n, Voided: 4n } as const;

async function installSystemContractMock(contractName: string, systemAddress: string) {
  const template = await ethers.deployContract(contractName);
  const runtimeCode = await ethers.provider.getCode(await template.getAddress());
  await network.provider.send("hardhat_setCode", [systemAddress, runtimeCode]);
}

async function deployCoverWithoutToken() {
  const [deployer, underwriter, buyer, secondUnderwriter, stranger] = await ethers.getSigners();
  await installSystemContractMock("MockHederaTokenService", HTS_ADDRESS);
  await installSystemContractMock("MockHederaScheduleService", HSS_ADDRESS);
  const scheduleService = (await ethers.getContractAt(
    "MockHederaScheduleService",
    HSS_ADDRESS,
  )) as unknown as MockHederaScheduleService;

  const priceFeed = await ethers.deployContract("MockAggregator", [PRICE_DECIMALS]);
  await priceFeed.pushRound(OPENING_PRICE, await time.latest());

  const cover = (await ethers.deployContract("PriceDropCover", [
    {
      priceFeed: await priceFeed.getAddress(),
      triggerDropBps: TRIGGER_DROP_BPS,
      premiumBps: PREMIUM_BPS,
      coverPeriod: COVER_PERIOD,
      maxPriceAge: MAX_PRICE_AGE,
      resolutionGasLimit: RESOLUTION_GAS_LIMIT,
      resolutionFee: RESOLUTION_FEE,
    },
  ])) as unknown as PriceDropCover;

  return { cover, priceFeed, scheduleService, deployer, underwriter, buyer, secondUnderwriter, stranger };
}

async function deployFundedCover() {
  const deployment = await deployCoverWithoutToken();
  const { cover, underwriter, buyer } = deployment;
  await cover.createPolicyToken({ value: TOKEN_CREATION_FEE });
  await cover.connect(underwriter).deposit({ value: POOL_DEPOSIT });

  const policyToken = (await ethers.getContractAt(
    "MockPolicyNft",
    await cover.policyToken(),
  )) as unknown as MockPolicyNft;
  await policyToken.connect(buyer).associate();
  return { ...deployment, policyToken };
}

export function loadCoverWithoutToken() {
  return loadFixture(deployCoverWithoutToken);
}

export function loadFundedCover() {
  return loadFixture(deployFundedCover);
}

export async function buyCover(cover: PriceDropCover, buyer: HardhatEthersSigner, payout = PAYOUT) {
  const [premium, strikePrice] = await cover.quote(payout);
  const purchase = await cover.connect(buyer).buyCover(payout, strikePrice, { value: premium + RESOLUTION_FEE });
  const receipt = await purchase.wait();
  const coverBought = receipt!.logs
    .map(log => cover.interface.parseLog(log))
    .find(parsed => parsed?.name === "CoverBought");
  return { policyId: coverBought!.args.policyId as bigint, premium };
}
