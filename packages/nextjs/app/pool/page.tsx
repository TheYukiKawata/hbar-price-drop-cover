"use client";

import type { NextPage } from "next";
import { DepositForm } from "~~/components/cover/DepositForm";
import { PoolStats } from "~~/components/cover/PoolStats";
import { WithCoverTerms } from "~~/components/cover/WithCoverTerms";
import { WithdrawForm } from "~~/components/cover/WithdrawForm";
import { usePoolState } from "~~/hooks/cover/usePoolState";

const PoolPage: NextPage = () => {
  return (
    <main className="w-full max-w-5xl mx-auto px-4 py-8 flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold m-0">Underwriter pool</h1>
        <p className="m-0 max-w-2xl text-base-content/80 leading-relaxed">
          Underwriters fund payouts and earn every premium. Buyers prepay the Hedera fee for each scheduled resolution.
        </p>
      </header>
      <WithCoverTerms>{() => <PoolBody />}</WithCoverTerms>
    </main>
  );
};

const PoolBody = () => {
  const { pool, isError } = usePoolState();

  if (pool) {
    return (
      <>
        <PoolStats pool={pool} />
        <div className="grid gap-8 md:grid-cols-2 items-start">
          <DepositForm />
          <WithdrawForm pool={pool} />
        </div>
      </>
    );
  }
  if (isError) {
    return (
      <p className="m-0 rounded-2xl bg-base-200 p-8 text-error">
        Could not read the pool from Hedera testnet. Check your connection and reload the page.
      </p>
    );
  }
  return <div className="h-64 rounded-2xl bg-base-300 animate-pulse" aria-label="Loading pool" />;
};

export default PoolPage;
