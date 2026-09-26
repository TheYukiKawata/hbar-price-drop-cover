import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { ethers, network } from "hardhat";
import {
  buyCover,
  loadCoverWithoutToken,
  loadFundedCover,
  OPENING_PRICE,
  PAYOUT,
  POOL_DEPOSIT,
  RESOLUTION_FEE,
} from "./coverFixture";

describe("UnderwriterPool", function () {
  it("gives the first underwriter one share per unit deposited", async function () {
    const { cover, underwriter } = await loadFundedCover();

    expect(await cover.sharesOf(underwriter.address)).to.equal(POOL_DEPOSIT);
    expect(await cover.assetsOf(underwriter.address)).to.equal(POOL_DEPOSIT);
  });

  it("credits premiums to existing underwriters before new deposits", async function () {
    const { cover, underwriter, secondUnderwriter, buyer, priceFeed } = await loadFundedCover();
    const { policyId, premium } = await buyCover(cover, buyer);
    const expiry = (await cover.policies(policyId)).expiry;

    await cover.connect(secondUnderwriter).deposit({ value: POOL_DEPOSIT });
    await priceFeed.pushRound(OPENING_PRICE, expiry - 60n);
    await time.increaseTo(expiry);
    await cover.resolve(policyId);

    expect(await cover.assetsOf(underwriter.address)).to.be.closeTo(POOL_DEPOSIT + premium + RESOLUTION_FEE, 2n);
    expect(await cover.assetsOf(secondUnderwriter.address)).to.be.closeTo(POOL_DEPOSIT, 2n);
  });

  it("pays back the deposit on full withdrawal", async function () {
    const { cover, underwriter } = await loadFundedCover();
    const shares = await cover.sharesOf(underwriter.address);

    await expect(cover.connect(underwriter).withdraw(shares)).to.changeEtherBalances(
      [underwriter, cover],
      [POOL_DEPOSIT, -POOL_DEPOSIT],
    );
    expect(await cover.totalShares()).to.equal(0n);
  });

  it("values withdrawals as if every open policy pays out", async function () {
    const { cover, underwriter, secondUnderwriter, buyer, priceFeed } = await loadFundedCover();
    await cover.connect(secondUnderwriter).deposit({ value: POOL_DEPOSIT });
    const { policyId } = await buyCover(cover, buyer);
    const expiry = (await cover.policies(policyId)).expiry;

    const leavingShares = await cover.sharesOf(underwriter.address);
    const withdrawn = await cover.connect(underwriter).withdraw.staticCall(leavingShares);
    await cover.connect(underwriter).withdraw(leavingShares);
    await priceFeed.pushRound(OPENING_PRICE / 2n, expiry - 60n);
    await time.increaseTo(expiry);
    await cover.resolve(policyId);

    expect(await cover.assetsOf(secondUnderwriter.address)).to.be.gte(withdrawn);
    expect(await cover.lockedCapital()).to.equal(0n);
  });

  it("does not let a deposit collect a premium without taking the risk", async function () {
    const { cover, secondUnderwriter, buyer } = await loadFundedCover();
    const deposit = POOL_DEPOSIT * 4n;
    await cover.connect(secondUnderwriter).deposit({ value: deposit });
    await buyCover(cover, buyer);

    const shares = await cover.sharesOf(secondUnderwriter.address);

    expect(await cover.connect(secondUnderwriter).withdraw.staticCall(shares)).to.be.lt(deposit);
  });

  it("refuses to burn shares for nothing while all capital is locked", async function () {
    const { cover, underwriter, buyer } = await loadFundedCover();
    await buyCover(cover, buyer, await cover.freeCapital());

    await expect(cover.connect(underwriter).withdraw(1n)).to.be.revertedWithCustomError(cover, "ZeroAmount");
  });

  it("refuses a deposit that would mint no shares", async function () {
    const { cover, underwriter } = await loadCoverWithoutToken();
    await network.provider.send("hardhat_setBalance", [await cover.getAddress(), ethers.toQuantity(POOL_DEPOSIT)]);

    await expect(cover.connect(underwriter).deposit({ value: POOL_DEPOSIT / 2n }))
      .to.be.revertedWithCustomError(cover, "ZeroShares")
      .withArgs(POOL_DEPOSIT / 2n);
  });

  it("rejects withdrawing more shares than owned", async function () {
    const { cover, stranger } = await loadFundedCover();

    await expect(cover.connect(stranger).withdraw(1n))
      .to.be.revertedWithCustomError(cover, "InsufficientShares")
      .withArgs(1n, 0n);
  });

  it("rejects empty deposits and withdrawals", async function () {
    const { cover, underwriter } = await loadFundedCover();

    await expect(cover.connect(underwriter).deposit({ value: 0n })).to.be.revertedWithCustomError(cover, "ZeroAmount");
    await expect(cover.connect(underwriter).withdraw(0n)).to.be.revertedWithCustomError(cover, "ZeroAmount");
  });

  it("reports no free capital when fees push assets below locked capital", async function () {
    const { cover, buyer } = await loadFundedCover();
    await buyCover(cover, buyer);

    await network.provider.send("hardhat_setBalance", [await cover.getAddress(), ethers.toQuantity(PAYOUT / 2n)]);

    expect(await cover.freeCapital()).to.equal(0n);
  });
});
