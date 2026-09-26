"use client";

import { FormEvent, useState } from "react";
import { PoolState } from "~~/hooks/cover/usePoolState";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-hbar";
import { formatTinybars, parseHbarToTinybars } from "~~/utils/cover/hbar";

type Withdrawal = { shares: bigint; minAmount: bigint };

type WithdrawalLimit = { maxShares: bigint; available: bigint };

function planWithdrawal(
  limit: WithdrawalLimit,
  amount: bigint,
  sharesForAmount: bigint | undefined,
): Withdrawal | undefined {
  if (amount >= limit.available) return { shares: limit.maxShares, minAmount: limit.available };
  if (sharesForAmount === undefined) return undefined;
  return { shares: sharesForAmount < limit.maxShares ? sharesForAmount : limit.maxShares, minAmount: amount };
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

  const maxShares = pool.maxWithdrawShares;
  const available = pool.withdrawable;
  const withdrawal =
    amount === undefined || available === undefined
      ? undefined
      : planWithdrawal({ maxShares, available }, amount, sharesForAmount);
  const canWithdraw =
    amount !== undefined &&
    available !== undefined &&
    amount > 0n &&
    amount <= available &&
    withdrawal !== undefined &&
    withdrawal.shares > 0n;

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
        {available === undefined
          ? "Reading how much you can withdraw…"
          : `You can withdraw up to ${formatTinybars(available)} HBAR.`}{" "}
        This value assumes every active policy pays out. If they expire without a payout, the capital returns to the
        underwriters who stayed.
      </p>
      {maxShares < pool.myShares && (
        <p className="m-0 text-sm text-base-content/70">
          While policies are open, a small number of shares must stay in the pool so that someone can claim the capital
          when the policies resolve. Your withdrawal leaves them in place.
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
            disabled={available === undefined}
            onClick={() => available !== undefined && setAmountText(formatTinybars(available, 8).replaceAll(",", ""))}
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
