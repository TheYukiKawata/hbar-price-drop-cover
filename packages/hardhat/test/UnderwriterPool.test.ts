import { expect } from "chai";
import { ethers, network } from "hardhat";
import { buyCover, loadFundedCover, PAYOUT, POOL_DEPOSIT } from "./coverFixture";

describe("UnderwriterPool", function () {
  it("gives the first underwriter one share per unit deposited", async function () {
    const { cover, underwriter } = await loadFundedCover();

    expect(await cover.sharesOf(underwriter.address)).to.equal(POOL_DEPOSIT);
    expect(await cover.assetsOf(underwriter.address)).to.equal(POOL_DEPOSIT);
  });

  it("credits premiums to existing underwriters before new deposits", async function () {
    const { cover, underwriter, secondUnderwriter, buyer } = await loadFundedCover();
    const { premium } = await buyCover(cover, buyer);

    await cover.connect(secondUnderwriter).deposit({ value: POOL_DEPOSIT });

    expect(await cover.assetsOf(underwriter.address)).to.be.closeTo(POOL_DEPOSIT + premium, 1n);
    expect(await cover.assetsOf(secondUnderwriter.address)).to.be.closeTo(POOL_DEPOSIT, 1n);
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

  it("keeps capital that backs active policies", async function () {
    const { cover, underwriter, buyer } = await loadFundedCover();
    await buyCover(cover, buyer);
    const shares = await cover.sharesOf(underwriter.address);

    await expect(cover.connect(underwriter).withdraw(shares)).to.be.revertedWithCustomError(
      cover,
      "InsufficientFreeCapital",
    );
    expect(await cover.lockedCapital()).to.equal(PAYOUT);
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
