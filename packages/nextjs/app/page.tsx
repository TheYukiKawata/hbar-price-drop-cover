"use client";

import type { NextPage } from "next";
import { BuyCoverForm } from "~~/components/cover/BuyCoverForm";
import { CoverTerms } from "~~/components/cover/CoverTerms";
import { HbarUsdPrice } from "~~/components/cover/HbarUsdPrice";
import { MyPolicies } from "~~/components/cover/MyPolicies";
import { WithCoverTerms } from "~~/components/cover/WithCoverTerms";

const CoverPage: NextPage = () => (
  <main className="w-full max-w-5xl mx-auto px-4 py-8 flex flex-col gap-8">
    <header className="flex flex-col gap-2">
      <h1 className="text-3xl font-semibold m-0">HBAR price-drop cover</h1>
      <p className="m-0 max-w-2xl text-base-content/80 leading-relaxed">
        Pay a small premium now. If HBAR falls below your strike by expiry, the contract pays you in HBAR without a
        claim form or an operator.
      </p>
    </header>
    <WithCoverTerms>
      {terms => (
        <>
          <HbarUsdPrice priceFeed={terms.priceFeed} />
          <div className="grid gap-8 md:grid-cols-2 items-start">
            <BuyCoverForm terms={terms} />
            <CoverTerms terms={terms} />
          </div>
          <MyPolicies policyToken={terms.policyToken} priceFeed={terms.priceFeed} />
        </>
      )}
    </WithCoverTerms>
  </main>
);

export default CoverPage;
