"use client";

import { FormEvent, useState } from "react";
import { PoolState } from "~~/hooks/cover/usePoolState";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-hbar";
import { formatTinybars, parseHbarToTinybars } from "~~/utils/cover/hbar";

function sharesForAmount(pool: PoolState, amount: bigint): bigint {
  return (amount * (pool.totalShares + 1n)) / (pool.freeCapital + 1n);
}

function sharesToBurn(pool: PoolState, amount: bigint): bigint {
  return amount >= pool.myAssets ? pool.myShares : sharesForAmount(pool, amount);
}

export const WithdrawForm = ({ pool }: { pool: PoolState }) => {
  const [amountText, setAmountText] = useState("");
  const amount = parseHbarToTinybars(amountText);
  const { writeContractAsync, isMining } = useScaffoldWriteContract({ contractName: "PriceDropCover" });

  const available = pool.myAssets;
  const shares = amount === undefined ? 0n : sharesToBurn(pool, amount);
  const canWithdraw = amount !== undefined && amount > 0n && amount <= available && shares > 0n;

  async function withdraw(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWithdraw) return;
    await writeContractAsync({ functionName: "withdraw", args: [shares] });
    setAmountText("");
  }

  return (
    <form onSubmit={withdraw} className="rounded-2xl bg-base-100 p-8 flex flex-col gap-4 shadow-sm">
      <h2 className="text-xl font-semibold m-0">Withdraw</h2>
      <p className="m-0 text-sm text-base-content/70">
        You can withdraw up to {formatTinybars(available)} HBAR. This value assumes every active policy pays out. If
        they expire without a payout, the capital returns to the underwriters who stayed.
      </p>
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
