"use client";

import { FormEvent, useState } from "react";
import { PoolState } from "~~/hooks/cover/usePoolState";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-hbar";
import { formatTinybars, parseHbarToTinybars } from "~~/utils/cover/hbar";

type Withdrawal = { shares: bigint; minAmount: bigint };

function isOnlyUnderwriterBackingPolicies(pool: PoolState) {
  return pool.myShares === pool.totalShares && pool.lockedCapital > 0n;
}

function planWithdrawal(pool: PoolState, amount: bigint, sharesForAmount: bigint | undefined): Withdrawal | undefined {
  const maxShares = isOnlyUnderwriterBackingPolicies(pool) ? pool.myShares - 1n : pool.myShares;
  if (amount >= pool.myAssets) return { shares: maxShares, minAmount: pool.myAssets > 0n ? pool.myAssets - 1n : 0n };
  if (sharesForAmount === undefined) return undefined;
  return { shares: sharesForAmount < maxShares ? sharesForAmount : maxShares, minAmount: amount };
}

export const WithdrawForm = ({ pool }: { pool: PoolState }) => {
  const [amountText, setAmountText] = useState("");
  const amount = parseHbarToTinybars(amountText);
  const { writeContractAsync, isMining } = useScaffoldWriteContract({ contractName: "PriceDropCover" });

  const { data: sharesForAmount } = useScaffoldReadContract({
    contractName: "PriceDropCover",
    functionName: "sharesToWithdraw",
    args: [amount],
    query: { enabled: amount !== undefined && amount > 0n },
  });

  const available = pool.myAssets;
  const withdrawal = amount === undefined ? undefined : planWithdrawal(pool, amount, sharesForAmount);
  const canWithdraw =
    amount !== undefined && amount > 0n && amount <= available && withdrawal !== undefined && withdrawal.shares > 0n;

  async function withdraw(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWithdraw) return;
    await writeContractAsync({ functionName: "withdraw", args: [withdrawal.shares, withdrawal.minAmount] });
    setAmountText("");
  }

  return (
    <form onSubmit={withdraw} className="rounded-2xl bg-base-100 p-8 flex flex-col gap-4 shadow-sm">
      <h2 className="text-xl font-semibold m-0">Withdraw</h2>
      <p className="m-0 text-sm text-base-content/70">
        You can withdraw up to {formatTinybars(available)} HBAR. This value assumes every active policy pays out. If
        they expire without a payout, the capital returns to the underwriters who stayed.
      </p>
      {isOnlyUnderwriterBackingPolicies(pool) && (
        <p className="m-0 text-sm text-base-content/70">
          You are the only underwriter while policies are open, so one share stays in the pool until they resolve.
        </p>
      )}
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">Amount (HBAR)</span>
        <div className="join w-full">
          <input
            className="input input-bordered join-item w-full text-lg tabular-nums"
            inputMode="decimal"
            placeholder="0"
            value={amountText}
            onChange={event => setAmountText(event.target.value)}
          />
          <button
            type="button"
            className="btn join-item"
            onClick={() => setAmountText(formatTinybars(available, 8).replaceAll(",", ""))}
          >
            Max
          </button>
        </div>
      </label>
      <button type="submit" className="btn btn-primary" disabled={!canWithdraw || isMining}>
        {isMining ? "Withdrawing…" : "Withdraw"}
      </button>
    </form>
  );
};
