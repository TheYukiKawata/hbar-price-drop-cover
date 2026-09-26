"use client";

import type { NextPage } from "next";
import { DepositForm } from "~~/components/cover/DepositForm";
import { PoolStats } from "~~/components/cover/PoolStats";
import { WithCoverTerms } from "~~/components/cover/WithCoverTerms";
import { WithdrawForm } from "~~/components/cover/WithdrawForm";
import { usePoolState } from "~~/hooks/cover/usePoolState";

const PoolPage: NextPage = () => {
  const pool = usePoolState();

  return (
    <main className="w-full max-w-5xl mx-auto px-4 py-8 flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold m-0">Underwriter pool</h1>
        <p className="m-0 max-w-2xl text-base-content/80 leading-relaxed">
          Underwriters fund payouts and earn every premium. The pool pays the Hedera fees for scheduled resolutions.
        </p>
      </header>
      <WithCoverTerms>
        {() =>
          pool ? (
            <>
              <PoolStats pool={pool} />
              <div className="grid gap-8 md:grid-cols-2 items-start">
                <DepositForm />
                <WithdrawForm pool={pool} />
              </div>
            </>
          ) : (
            <div className="h-64 rounded-2xl bg-base-300 animate-pulse" aria-label="Loading pool" />
          )
        }
      </WithCoverTerms>
    </main>
  );
};

export default PoolPage;
