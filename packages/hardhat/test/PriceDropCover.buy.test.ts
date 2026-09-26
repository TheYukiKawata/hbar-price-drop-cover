import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import {
  buyCover,
  COVER_PERIOD,
  loadCoverWithoutToken,
  loadFundedCover,
  MAX_PRICE_AGE,
  OPENING_PRICE,
  PAYOUT,
  POOL_DEPOSIT,
  PolicyStatus,
  PREMIUM_BPS,
  RESOLUTION_FEE,
  RESOLUTION_GAS_LIMIT,
  TOKEN_CREATION_FEE,
  TRIGGER_DROP_BPS,
} from "./coverFixture";

const TOKEN_NOT_ASSOCIATED_TO_ACCOUNT = 184n;

describe("PriceDropCover: terms and policy token", function () {
  it("rejects terms that cannot price or settle cover", async function () {
    const { priceFeed } = await loadCoverWithoutToken();
    const factory = await ethers.getContractFactory("PriceDropCover");
    const validTerms = {
      priceFeed: await priceFeed.getAddress(),
      triggerDropBps: TRIGGER_DROP_BPS,
      premiumBps: PREMIUM_BPS,
      coverPeriod: COVER_PERIOD,
      maxPriceAge: MAX_PRICE_AGE,
      resolutionGasLimit: RESOLUTION_GAS_LIMIT,
      resolutionFee: RESOLUTION_FEE,
    };
    const invalidTerms = [
      { ...validTerms, priceFeed: ethers.ZeroAddress },
      { ...validTerms, triggerDropBps: 0n },
      { ...validTerms, triggerDropBps: 10_000n },
      { ...validTerms, premiumBps: 0n },
      { ...validTerms, coverPeriod: 0n },
      { ...validTerms, maxPriceAge: 0n },
      { ...validTerms, resolutionGasLimit: 0n },
    ];

    for (const terms of invalidTerms) {
      await expect(factory.deploy(terms)).to.be.revertedWithCustomError(factory, "InvalidTerms");
    }
  });

  it("creates the policy NFT collection once", async function () {
    const { cover } = await loadCoverWithoutToken();

    await expect(cover.createPolicyToken({ value: TOKEN_CREATION_FEE })).to.emit(cover, "PolicyTokenCreated");
    const policyToken = await cover.policyToken();

    await expect(cover.createPolicyToken({ value: TOKEN_CREATION_FEE }))
      .to.be.revertedWithCustomError(cover, "PolicyTokenAlreadyCreated")
      .withArgs(policyToken);
  });

  it("surfaces the Hedera response code when token creation fails", async function () {
    const { cover } = await loadCoverWithoutToken();
    const INSUFFICIENT_TX_FEE = 9n;

    await expect(cover.createPolicyToken({ value: 0n }))
      .to.be.revertedWithCustomError(cover, "HederaCallFailed")
      .withArgs("createNonFungibleToken", INSUFFICIENT_TX_FEE);
  });

  it("refuses to sell cover before the policy token exists", async function () {
    const { cover, buyer } = await loadCoverWithoutToken();

    await expect(cover.connect(buyer).buyCover(PAYOUT, 0n)).to.be.revertedWithCustomError(
      cover,
      "PolicyTokenNotCreated",
    );
  });
});

describe("PriceDropCover: buying cover", function () {
  it("quotes the premium and a strike below the live price", async function () {
    const { cover } = await loadFundedCover();

    const [premium, strikePrice] = await cover.quote(PAYOUT);

    expect(premium).to.equal((PAYOUT * PREMIUM_BPS) / 10_000n);
    expect(strikePrice).to.equal((OPENING_PRICE * (10_000n - TRIGGER_DROP_BPS)) / 10_000n);
  });

  it("rounds the premium up", async function () {
    const { cover } = await loadFundedCover();

    const [premium] = await cover.quote(1n);

    expect(premium).to.equal(1n);
  });

  it("mints the policy NFT to the buyer and locks the payout", async function () {
    const { cover, buyer, policyToken } = await loadFundedCover();
    const [premium, strikePrice] = await cover.quote(PAYOUT);

    const price = premium + RESOLUTION_FEE;
    const purchase = cover.connect(buyer).buyCover(PAYOUT, 0n, { value: price });

    await expect(purchase).to.changeEtherBalances([buyer, cover], [-price, price]);
    await expect(purchase).to.emit(cover, "CoverBought");
    const expiry = BigInt(await time.latest()) + COVER_PERIOD;
    const policy = await cover.policies(1n);
    expect(await policyToken.ownerOf(1n)).to.equal(buyer.address);
    expect(policy.payout).to.equal(PAYOUT);
    expect(policy.premium).to.equal(premium);
    expect(policy.strikePrice).to.equal(strikePrice);
    expect(policy.expiry).to.equal(expiry);
    expect(policy.status).to.equal(PolicyStatus.Active);
    expect(await cover.lockedCapital()).to.equal(PAYOUT);
  });

  it("schedules resolution just after expiry with the Hedera Schedule Service", async function () {
    const { cover, buyer, scheduleService } = await loadFundedCover();

    const { policyId } = await buyCover(cover, buyer);

    const policy = await cover.policies(policyId);
    const scheduled = await scheduleService.scheduledCalls(0n);
    expect(scheduled.to).to.equal(await cover.getAddress());
    expect(scheduled.expirySecond).to.equal(policy.expiry + (await cover.RESOLUTION_SCHEDULE_OFFSET()));
    expect(scheduled.gasLimit).to.equal(RESOLUTION_GAS_LIMIT);
    expect(scheduled.callData).to.equal(cover.interface.encodeFunctionData("resolve", [policyId]));
    expect(policy.resolutionSchedule).to.not.equal(ethers.ZeroAddress);
  });

  it("moves resolution to the next second with schedule capacity", async function () {
    const { cover, buyer, scheduleService } = await loadFundedCover();
    const purchaseTime = BigInt(await time.latest()) + 1_000n;
    const firstSecond = purchaseTime + COVER_PERIOD + (await cover.RESOLUTION_SCHEDULE_OFFSET());
    await scheduleService.markSecondFull(firstSecond);
    await scheduleService.markSecondFull(firstSecond + 1n);
    await time.setNextBlockTimestamp(purchaseTime);

    await buyCover(cover, buyer);

    const scheduled = await scheduleService.scheduledCalls(0n);
    expect(scheduled.expirySecond).to.equal(firstSecond + 2n);
  });

  it("rejects cover when no second near expiry has schedule capacity", async function () {
    const { cover, buyer, scheduleService } = await loadFundedCover();
    const purchaseTime = BigInt(await time.latest()) + 1_000n;
    const expiry = purchaseTime + COVER_PERIOD;
    const firstSecond = expiry + (await cover.RESOLUTION_SCHEDULE_OFFSET());
    for (let second = firstSecond; second <= firstSecond + 30n; second++) {
      await scheduleService.markSecondFull(second);
    }
    const [premium] = await cover.quote(PAYOUT);
    await time.setNextBlockTimestamp(purchaseTime);

    await expect(cover.connect(buyer).buyCover(PAYOUT, 0n, { value: premium + RESOLUTION_FEE }))
      .to.be.revertedWithCustomError(cover, "NoScheduleCapacity")
      .withArgs(expiry);
  });

  it("requires the premium plus the resolution fee", async function () {
    const { cover, buyer } = await loadFundedCover();
    const [premium] = await cover.quote(PAYOUT);

    await expect(cover.connect(buyer).buyCover(PAYOUT, 0n, { value: premium }))
      .to.be.revertedWithCustomError(cover, "WrongPayment")
      .withArgs(premium + RESOLUTION_FEE, premium);
  });

  it("reserves the resolution fee for the scheduled call", async function () {
    const { cover, buyer } = await loadFundedCover();
    const assetsBefore = await cover.totalAssets();

    const { premium } = await buyCover(cover, buyer);

    expect(await cover.totalAssets()).to.equal(assetsBefore + premium);
    expect(await cover.reservedResolutionFees()).to.equal(RESOLUTION_FEE);
  });

  it("rejects a strike below the buyer's minimum", async function () {
    const { cover, buyer, priceFeed } = await loadFundedCover();
    const [premium, quotedStrike] = await cover.quote(PAYOUT);
    await priceFeed.pushRound(OPENING_PRICE / 2n, await time.latest());
    const [, lowerStrike] = await cover.quote(PAYOUT);

    await expect(cover.connect(buyer).buyCover(PAYOUT, quotedStrike, { value: premium + RESOLUTION_FEE }))
      .to.be.revertedWithCustomError(cover, "StrikeBelowMinimum")
      .withArgs(lowerStrike, quotedStrike);
  });

  it("rejects a payout larger than the free capital", async function () {
    const { cover, buyer } = await loadFundedCover();
    const payout = POOL_DEPOSIT * 2n;
    const [premium] = await cover.quote(payout);

    await expect(cover.connect(buyer).buyCover(payout, 0n, { value: premium + RESOLUTION_FEE }))
      .to.be.revertedWithCustomError(cover, "InsufficientFreeCapital")
      .withArgs(payout, POOL_DEPOSIT + premium);
  });

  it("rejects a zero payout", async function () {
    const { cover, buyer } = await loadFundedCover();

    await expect(cover.connect(buyer).buyCover(0n, 0n)).to.be.revertedWithCustomError(cover, "ZeroAmount");
  });

  it("refuses to price cover from a stale feed", async function () {
    const { cover, buyer } = await loadFundedCover();
    await time.increase(MAX_PRICE_AGE + 1n);

    await expect(cover.connect(buyer).buyCover(PAYOUT, 0n)).to.be.revertedWithCustomError(cover, "StalePrice");
  });

  it("refuses to price cover from a non-positive answer", async function () {
    const { cover, buyer, priceFeed } = await loadFundedCover();
    await priceFeed.pushRound(0n, await time.latest());

    await expect(cover.connect(buyer).buyCover(PAYOUT, 0n))
      .to.be.revertedWithCustomError(cover, "InvalidPrice")
      .withArgs(0n);
  });

  it("tells buyers who have not associated the policy token", async function () {
    const { cover, stranger } = await loadFundedCover();
    const [premium] = await cover.quote(PAYOUT);

    await expect(cover.connect(stranger).buyCover(PAYOUT, 0n, { value: premium + RESOLUTION_FEE }))
      .to.be.revertedWithCustomError(cover, "HederaCallFailed")
      .withArgs("transferNFT", TOKEN_NOT_ASSOCIATED_TO_ACCOUNT);
  });
});
