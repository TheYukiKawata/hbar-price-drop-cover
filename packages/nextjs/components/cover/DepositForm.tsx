"use client";

import { FormEvent, useState } from "react";
import { useAccount } from "wagmi";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-hbar";
import { parseHbarToTinybars, tinybarsToWeibar } from "~~/utils/cover/hbar";

export const DepositForm = () => {
  const { isConnected } = useAccount();
  const [amountText, setAmountText] = useState("");
  const amount = parseHbarToTinybars(amountText);
  const { writeContractAsync, isMining } = useScaffoldWriteContract({ contractName: "PriceDropCover" });

  const canDeposit = isConnected && amount !== undefined && amount > 0n;

  async function deposit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canDeposit) return;
    await writeContractAsync({ functionName: "deposit", value: tinybarsToWeibar(amount) });
    setAmountText("");
  }

  return (
    <form onSubmit={deposit} className="rounded-2xl bg-base-100 p-8 flex flex-col gap-4 shadow-sm">
      <h2 className="text-xl font-semibold m-0">Deposit</h2>
      <p className="m-0 text-sm text-base-content/70">
        Deposits back policies. Premiums raise the value of every share. Payouts lower it.
      </p>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">Amount (HBAR)</span>
        <input
          className="input input-bordered w-full text-lg tabular-nums"
          inputMode="decimal"
          placeholder="100"
          value={amountText}
          onChange={event => setAmountText(event.target.value)}
        />
      </label>
      <button type="submit" className="btn btn-primary" disabled={!canDeposit || isMining}>
        {isMining ? "Depositing…" : "Deposit"}
      </button>
    </form>
  );
};
