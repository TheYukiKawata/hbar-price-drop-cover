"use client";

import { FormEvent, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { CoverTerms } from "~~/hooks/cover/useCoverTerms";
import { useHbarUsdPrice } from "~~/hooks/cover/useHbarUsdPrice";
import { usePolicyTokenAssociation } from "~~/hooks/cover/usePolicyTokenAssociation";
import { usePoolState } from "~~/hooks/cover/usePoolState";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-hbar";
import { formatTinybars, parseHbarToTinybars, tinybarsToWeibar } from "~~/utils/cover/hbar";
import { formatUsdPrice } from "~~/utils/cover/price";
import { formatTimestamp, nowInSeconds } from "~~/utils/cover/time";

const BUY_COVER_GAS_LIMIT = 800_000n;

export const BuyCoverForm = ({ terms }: { terms: CoverTerms }) => {
  const { isConnected } = useAccount();
  const queryClient = useQueryClient();
  const [payoutText, setPayoutText] = useState("");
  const payout = parseHbarToTinybars(payoutText);

  const { pool } = usePoolState();
  const { price } = useHbarUsdPrice(terms.priceFeed);
  const { needsAssociation, isAssociationCheckFailed, associate, isAssociating } = usePolicyTokenAssociation(
    terms.policyToken,
  );
  const { data: quote, error: quoteError } = useScaffoldReadContract({
    contractName: "PriceDropCover",
    functionName: "quote",
    args: [payout],
    query: { enabled: payout !== undefined && payout > 0n },
  });
  const { writeContractAsync, isMining } = useScaffoldWriteContract({ contractName: "PriceDropCover" });

  const exceedsFreeCapital = payout !== undefined && pool !== undefined && payout > pool.freeCapital;
  const canBuy =
    isConnected &&
    payout !== undefined &&
    payout > 0n &&
    quote !== undefined &&
    !exceedsFreeCapital &&
    (needsAssociation === false || isAssociationCheckFailed);

  async function buyCover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canBuy) return;

    const [premium, quotedStrike] = quote;
    await writeContractAsync({
      functionName: "buyCover",
      args: [payout, quotedStrike],
      value: tinybarsToWeibar(premium + terms.resolutionFee),
      gas: BUY_COVER_GAS_LIMIT,
    });
    setPayoutText("");
    await queryClient.invalidateQueries({ queryKey: ["owned-policy-ids"] });
  }

  return (
    <form onSubmit={buyCover} className="rounded-2xl bg-base-100 p-8 flex flex-col gap-4 shadow-sm">
      <h2 className="text-xl font-semibold m-0">Buy cover</h2>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">Payout if the price drops (HBAR)</span>
        <input
          className="input input-bordered w-full text-lg tabular-nums"
          inputMode="decimal"
          placeholder="50"
          value={payoutText}
          onChange={event => setPayoutText(event.target.value)}
        />
      </label>

      {pool && (
        <p className="text-sm text-base-content/70 m-0">
          The pool can cover up to {formatTinybars(pool.freeCapital)} HBAR.
        </p>
      )}

      <QuoteSummary
        quote={quote}
        resolutionFee={terms.resolutionFee}
        priceDecimals={price?.decimals}
        hasQuoteError={quoteError !== null && payout !== undefined}
        expiry={nowInSeconds() + terms.coverPeriod}
      />

      {exceedsFreeCapital && <p className="text-error text-sm m-0">This payout is larger than the free capital.</p>}

      {needsAssociation ? (
        <button type="button" className="btn btn-secondary" onClick={associate} disabled={isAssociating}>
          {isAssociating ? "Associating…" : "Associate the policy NFT with your account"}
        </button>
      ) : (
        <button type="submit" className="btn btn-primary" disabled={!canBuy || isMining}>
          {buyButtonLabel({ isConnected, isMining })}
        </button>
      )}
    </form>
  );
};

function buyButtonLabel({ isConnected, isMining }: { isConnected: boolean; isMining: boolean }) {
  if (!isConnected) return "Connect a wallet to buy cover";
  if (isMining) return "Buying cover…";
  return "Buy cover";
}

type QuoteSummaryProps = {
  quote: readonly [bigint, bigint] | undefined;
  resolutionFee: bigint;
  priceDecimals: number | undefined;
  hasQuoteError: boolean;
  expiry: bigint;
};

const QuoteSummary = ({ quote, resolutionFee, priceDecimals, hasQuoteError, expiry }: QuoteSummaryProps) => {
  if (hasQuoteError) {
    return <p className="text-error text-sm m-0">No fresh Chainlink price. Cover cannot be priced right now.</p>;
  }
  if (!quote || priceDecimals === undefined) return null;

  const [premium, strikePrice] = quote;
  return (
    <dl className="grid grid-cols-2 gap-2 m-0 text-sm">
      <dt className="text-base-content/70">Premium</dt>
      <dd className="m-0 text-right tabular-nums">{formatTinybars(premium)} HBAR</dd>
      <dt className="text-base-content/70">Scheduled resolution fee</dt>
      <dd className="m-0 text-right tabular-nums">{formatTinybars(resolutionFee)} HBAR</dd>
      <dt className="font-medium">You pay</dt>
      <dd className="m-0 text-right tabular-nums font-medium">{formatTinybars(premium + resolutionFee)} HBAR</dd>
      <dt className="text-base-content/70">Pays out below</dt>
      <dd className="m-0 text-right tabular-nums">{formatUsdPrice(strikePrice, priceDecimals)}</dd>
      <dt className="text-base-content/70">Expires</dt>
      <dd className="m-0 text-right">{formatTimestamp(expiry)}</dd>
    </dl>
  );
};
