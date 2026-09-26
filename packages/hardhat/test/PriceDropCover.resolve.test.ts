import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { MockAggregator, MockPolicyNft, PolicyHolderWallet, PriceDropCover } from "../typechain-types";
import {
  buyCover,
  loadFundedCover,
  MAX_PRICE_AGE,
  OPENING_PRICE,
  PAYOUT,
  PolicyStatus,
  RESOLUTION_FEE,
} from "./coverFixture";

const CRASHED_PRICE = ethers.parseUnits("0.05", 8);
const RISEN_PRICE = ethers.parseUnits("0.12", 8);

async function pushRoundAt(priceFeed: MockAggregator, answer: bigint, updatedAt: bigint) {
  await priceFeed.pushRound(answer, updatedAt);
  return priceFeed.latestRoundId();
}

async function expiryOf(cover: PriceDropCover, policyId: bigint) {
  return (await cover.policies(policyId)).expiry;
}

describe("PriceDropCover: resolving cover", function () {
  it("pays the holder when the price at expiry is below the strike", async function () {
    const { cover, buyer, priceFeed, scheduleService } = await loadFundedCover();
    const { policyId } = await buyCover(cover, buyer);
    const expiry = await expiryOf(cover, policyId);
    const roundId = await pushRoundAt(priceFeed, CRASHED_PRICE, expiry - 60n);
    await time.increaseTo(expiry);

    const resolution = scheduleService.execute(0n);

    await expect(resolution).to.changeEtherBalances([buyer, cover], [PAYOUT, -PAYOUT]);
    await expect(resolution)
      .to.emit(cover, "PolicyResolved")
      .withArgs(policyId, PolicyStatus.PaidOut, roundId, CRASHED_PRICE, buyer.address, PAYOUT);
    expect((await cover.policies(policyId)).status).to.equal(PolicyStatus.PaidOut);
    expect(await cover.lockedCapital()).to.equal(0n);
  });

  it("releases the payout to underwriters when the price holds", async function () {
    const { cover, buyer, priceFeed, scheduleService } = await loadFundedCover();
    const { policyId } = await buyCover(cover, buyer);
    const expiry = await expiryOf(cover, policyId);
    await pushRoundAt(priceFeed, RISEN_PRICE, expiry - 60n);
    await time.increaseTo(expiry);

    await expect(scheduleService.execute(0n)).to.changeEtherBalance(buyer, 0n);

    expect((await cover.policies(policyId)).status).to.equal(PolicyStatus.Expired);
    expect(await cover.lockedCapital()).to.equal(0n);
  });

  it("refunds the premium when no fresh price exists at expiry", async function () {
    const { cover, buyer, scheduleService } = await loadFundedCover();
    const { policyId, premium } = await buyCover(cover, buyer);
    await time.increaseTo(await expiryOf(cover, policyId));

    await expect(scheduleService.execute(0n)).to.changeEtherBalance(buyer, premium);

    expect((await cover.policies(policyId)).status).to.equal(PolicyStatus.Voided);
  });

  it("uses the last round before expiry, not a later one", async function () {
    const { cover, buyer, priceFeed } = await loadFundedCover();
    const { policyId } = await buyCover(cover, buyer);
    const expiry = await expiryOf(cover, policyId);
    const roundAtExpiry = await pushRoundAt(priceFeed, RISEN_PRICE, expiry - 60n);
    await time.increaseTo(expiry + 600n);
    await pushRoundAt(priceFeed, CRASHED_PRICE, expiry + 300n);

    await expect(cover.resolve(policyId))
      .to.emit(cover, "PolicyResolved")
      .withArgs(policyId, PolicyStatus.Expired, roundAtExpiry, RISEN_PRICE, buyer.address, 0n);
  });

  it("pays whoever holds the policy NFT at resolution", async function () {
    const { cover, buyer, stranger, priceFeed, policyToken } = await loadFundedCover();
    const { policyId } = await buyCover(cover, buyer);
    await policyToken.connect(stranger).associate();
    await policyToken.connect(buyer).transferFrom(buyer.address, stranger.address, policyId);
    const expiry = await expiryOf(cover, policyId);
    await pushRoundAt(priceFeed, CRASHED_PRICE, expiry - 60n);
    await time.increaseTo(expiry);

    await expect(cover.resolve(policyId)).to.changeEtherBalances([stranger, buyer], [PAYOUT, 0n]);
  });

  it("does not resolve before expiry", async function () {
    const { cover, buyer } = await loadFundedCover();
    const { policyId } = await buyCover(cover, buyer);

    await expect(cover.resolve(policyId))
      .to.be.revertedWithCustomError(cover, "CoverNotExpired")
      .withArgs(policyId, await expiryOf(cover, policyId));
  });

  it("resolves each policy once", async function () {
    const { cover, buyer, priceFeed } = await loadFundedCover();
    const { policyId } = await buyCover(cover, buyer);
    const expiry = await expiryOf(cover, policyId);
    await pushRoundAt(priceFeed, CRASHED_PRICE, expiry - 60n);
    await time.increaseTo(expiry);
    await cover.resolve(policyId);

    await expect(cover.resolve(policyId)).to.be.revertedWithCustomError(cover, "PolicyNotActive").withArgs(policyId);
  });

  it("rejects unknown policies", async function () {
    const { cover } = await loadFundedCover();

    await expect(cover.resolve(42n)).to.be.revertedWithCustomError(cover, "PolicyNotActive").withArgs(42n);
  });

  it("voids the policy when the price at expiry is not positive", async function () {
    const { cover, buyer, priceFeed } = await loadFundedCover();
    const { policyId, premium } = await buyCover(cover, buyer);
    const expiry = await expiryOf(cover, policyId);
    await pushRoundAt(priceFeed, 0n, expiry - 60n);
    await time.increaseTo(expiry);

    await expect(cover.resolve(policyId)).to.changeEtherBalance(buyer, premium);
    expect((await cover.policies(policyId)).status).to.equal(PolicyStatus.Voided);
  });

  it("asks for a round proof when the round at expiry is too far back", async function () {
    const { cover, buyer, priceFeed } = await loadFundedCover();
    const { policyId } = await buyCover(cover, buyer);
    const expiry = await expiryOf(cover, policyId);
    await time.increaseTo(expiry + 3_600n);
    for (let i = 0n; i < 25n; i++) {
      await pushRoundAt(priceFeed, OPENING_PRICE, expiry + 60n + i);
    }

    await expect(cover.resolve(policyId)).to.be.revertedWithCustomError(cover, "NoRoundFoundBefore").withArgs(expiry);
  });
});

describe("PriceDropCover: resolving with a round proof", function () {
  async function policyWithRoundsAroundExpiry() {
    const fixture = await loadFundedCover();
    const { cover, buyer, priceFeed } = fixture;
    const { policyId } = await buyCover(cover, buyer);
    const expiry = await expiryOf(cover, policyId);
    const roundBeforeExpiry = await pushRoundAt(priceFeed, RISEN_PRICE, expiry - 600n);
    const roundAtExpiry = await pushRoundAt(priceFeed, CRASHED_PRICE, expiry - 60n);
    await time.increaseTo(expiry + 900n);
    const roundAfterExpiry = await pushRoundAt(priceFeed, RISEN_PRICE, expiry + 600n);
    return { ...fixture, policyId, expiry, roundBeforeExpiry, roundAtExpiry, roundAfterExpiry };
  }

  it("settles with the last round before expiry", async function () {
    const { cover, buyer, policyId, roundAtExpiry } = await policyWithRoundsAroundExpiry();

    await expect(cover.resolveWithRound(policyId, roundAtExpiry)).to.changeEtherBalance(buyer, PAYOUT);
  });

  it("accepts the last round of a phase that ended before expiry", async function () {
    const { cover, buyer, priceFeed } = await loadFundedCover();
    const { policyId } = await buyCover(cover, buyer);
    const expiry = await expiryOf(cover, policyId);
    const lastRoundOfOldPhase = await pushRoundAt(priceFeed, CRASHED_PRICE, expiry - 60n);
    await priceFeed.startNextPhase();
    await time.increaseTo(expiry + 900n);
    await pushRoundAt(priceFeed, RISEN_PRICE, expiry + 600n);

    await expect(cover.resolve(policyId)).to.be.revertedWithCustomError(cover, "NoRoundFoundBefore");
    await expect(cover.resolveWithRound(policyId, lastRoundOfOldPhase)).to.changeEtherBalance(buyer, PAYOUT);
  });

  it("rejects an earlier round", async function () {
    const { cover, policyId, expiry, roundBeforeExpiry } = await policyWithRoundsAroundExpiry();

    await expect(cover.resolveWithRound(policyId, roundBeforeExpiry))
      .to.be.revertedWithCustomError(cover, "RoundNotLastBefore")
      .withArgs(roundBeforeExpiry, expiry);
  });

  it("rejects a round after expiry", async function () {
    const { cover, policyId, expiry, roundAfterExpiry } = await policyWithRoundsAroundExpiry();

    await expect(cover.resolveWithRound(policyId, roundAfterExpiry))
      .to.be.revertedWithCustomError(cover, "RoundNotLastBefore")
      .withArgs(roundAfterExpiry, expiry);
  });

  it("voids the policy when the round at expiry is stale", async function () {
    const { cover, buyer, priceFeed } = await loadFundedCover();
    const { policyId, premium } = await buyCover(cover, buyer);
    const expiry = await expiryOf(cover, policyId);
    const staleRound = await pushRoundAt(priceFeed, CRASHED_PRICE, expiry - MAX_PRICE_AGE - 1n);
    await time.increaseTo(expiry + 60n);
    await pushRoundAt(priceFeed, CRASHED_PRICE, expiry + 30n);

    await expect(cover.resolveWithRound(policyId, staleRound)).to.changeEtherBalance(buyer, premium);
    expect((await cover.policies(policyId)).status).to.equal(PolicyStatus.Voided);
  });
});

describe("PriceDropCover: payouts the holder cannot receive", function () {
  async function crashedPolicyHeldByWallet() {
    const fixture = await loadFundedCover();
    const { cover, buyer, priceFeed, policyToken } = fixture;
    const { policyId } = await buyCover(cover, buyer);
    const wallet = (await ethers.deployContract("PolicyHolderWallet")) as unknown as PolicyHolderWallet;
    await wallet.associate(policyToken as unknown as MockPolicyNft);
    await policyToken.connect(buyer).transferFrom(buyer.address, await wallet.getAddress(), policyId);
    const expiry = await expiryOf(cover, policyId);
    await pushRoundAt(priceFeed, CRASHED_PRICE, expiry - 60n);
    await time.increaseTo(expiry);
    return { ...fixture, policyId, wallet };
  }

  it("settles the policy and holds the payout for the holder", async function () {
    const { cover, policyId, wallet } = await crashedPolicyHeldByWallet();
    const assetsBefore = await cover.totalAssets();

    await expect(cover.resolve(policyId))
      .to.emit(cover, "PayoutUnclaimed")
      .withArgs(policyId, await wallet.getAddress(), PAYOUT);

    expect((await cover.policies(policyId)).status).to.equal(PolicyStatus.PaidOut);
    expect(await cover.lockedCapital()).to.equal(0n);
    expect(await cover.unclaimedPayoutOf(policyId)).to.equal(PAYOUT);
    expect(await cover.totalAssets()).to.equal(assetsBefore - PAYOUT + RESOLUTION_FEE);
  });

  it("lets the holder claim the payout later", async function () {
    const { cover, policyId, wallet } = await crashedPolicyHeldByWallet();
    await cover.resolve(policyId);
    await wallet.setAcceptsHbar(true);

    await expect(wallet.claimPayout(await cover.getAddress(), policyId)).to.changeEtherBalance(wallet, PAYOUT);

    expect(await cover.unclaimedPayoutOf(policyId)).to.equal(0n);
    expect(await cover.unclaimedPayouts()).to.equal(0n);
  });

  it("lets only the holder claim", async function () {
    const { cover, policyId, wallet, stranger } = await crashedPolicyHeldByWallet();
    await cover.resolve(policyId);

    await expect(cover.connect(stranger).claimPayout(policyId))
      .to.be.revertedWithCustomError(cover, "NotPolicyHolder")
      .withArgs(policyId, await wallet.getAddress());
  });

  it("rejects a claim when nothing is owed", async function () {
    const { cover, buyer } = await loadFundedCover();
    const { policyId } = await buyCover(cover, buyer);

    await expect(cover.connect(buyer).claimPayout(policyId))
      .to.be.revertedWithCustomError(cover, "NothingToClaim")
      .withArgs(policyId);
  });
});

describe("PriceDropCover: voiding a policy nobody can resolve", function () {
  it("releases the reserved resolution fee to the pool at settlement", async function () {
    const { cover, buyer, priceFeed, scheduleService } = await loadFundedCover();
    const { policyId } = await buyCover(cover, buyer);
    const expiry = await expiryOf(cover, policyId);
    await pushRoundAt(priceFeed, RISEN_PRICE, expiry - 60n);
    await time.increaseTo(expiry);
    const assetsBefore = await cover.totalAssets();

    await scheduleService.execute(0n);

    expect(await cover.reservedResolutionFees()).to.equal(0n);
    expect(await cover.totalAssets()).to.equal(assetsBefore + RESOLUTION_FEE);
  });

  it("refunds the premium once the void delay has passed", async function () {
    const { cover, buyer, stranger } = await loadFundedCover();
    const { policyId, premium } = await buyCover(cover, buyer);
    await time.increaseTo((await expiryOf(cover, policyId)) + (await cover.UNRESOLVED_VOID_DELAY()));

    await expect(cover.connect(stranger).voidUnresolved(policyId)).to.changeEtherBalance(buyer, premium);

    expect((await cover.policies(policyId)).status).to.equal(PolicyStatus.Voided);
    expect(await cover.lockedCapital()).to.equal(0n);
  });

  it("waits for the void delay after expiry", async function () {
    const { cover, buyer } = await loadFundedCover();
    const { policyId } = await buyCover(cover, buyer);
    const voidableAt = (await expiryOf(cover, policyId)) + (await cover.UNRESOLVED_VOID_DELAY());
    await time.increaseTo(voidableAt - 10n);

    await expect(cover.voidUnresolved(policyId))
      .to.be.revertedWithCustomError(cover, "VoidTooEarly")
      .withArgs(policyId, voidableAt);
  });
});
