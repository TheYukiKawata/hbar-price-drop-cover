import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { PriceDropCover } from "../typechain-types";

const CHAINLINK_HBAR_USD_FEEDS: Record<string, string> = {
  hederaTestnet: "0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a",
  hederaMainnet: "0xAF685FB45C12b92b5054ccb9313e135525F9b5d5",
};

const TINYBARS_PER_HBAR = 100_000_000;
const ONE_HOUR = 60 * 60;
const ONE_WEEK = 7 * 24 * ONE_HOUR;

const DEFAULT_TERMS = {
  triggerDropBps: 1_000,
  premiumBps: 200,
  coverPeriod: ONE_WEEK,
  maxPriceAge: 3 * ONE_HOUR,
  resolutionGasLimit: 250_000,
  resolutionFee: TINYBARS_PER_HBAR,
};

const DEFAULT_POLICY_TOKEN_CREATION_FEE_HBAR = "15";

const deployPriceDropCover: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const priceFeed = CHAINLINK_HBAR_USD_FEEDS[hre.network.name];
  if (!priceFeed) {
    throw new Error(`No Chainlink HBAR/USD feed for network "${hre.network.name}". Use --network hederaTestnet.`);
  }

  const { deployer } = await hre.getNamedAccounts();
  const terms = {
    ...DEFAULT_TERMS,
    priceFeed,
    coverPeriod: Number(process.env.COVER_PERIOD_SECONDS || DEFAULT_TERMS.coverPeriod),
  };

  const deployment = await hre.deployments.deploy("PriceDropCover", {
    from: deployer,
    args: [terms],
    log: true,
    autoMine: true,
  });

  const cover = (await ethers.getContractAt("PriceDropCover", deployment.address)) as unknown as PriceDropCover;
  if ((await cover.policyToken()) !== ethers.ZeroAddress) return;

  const creationFee = ethers.parseEther(
    process.env.POLICY_TOKEN_CREATION_FEE_HBAR || DEFAULT_POLICY_TOKEN_CREATION_FEE_HBAR,
  );
  await (await cover.createPolicyToken({ value: creationFee, gasLimit: 400_000 })).wait();
  console.log(`🎟️  Policy NFT collection: ${await cover.policyToken()}`);
};

export default deployPriceDropCover;

deployPriceDropCover.tags = ["PriceDropCover"];
