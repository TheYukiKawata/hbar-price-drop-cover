"use client";

import { Address } from "viem";
import { useHbarUsdPrice } from "~~/hooks/cover/useHbarUsdPrice";
import { formatUsdPrice } from "~~/utils/cover/price";
import { formatTimestamp } from "~~/utils/cover/time";

export const HbarUsdPrice = ({ priceFeed }: { priceFeed: Address | undefined }) => {
  const { price, error } = useHbarUsdPrice(priceFeed);

  if (error) return <p className="text-error m-0">Could not read the Chainlink HBAR/USD feed.</p>;
  if (!price) return <div className="h-12 w-48 rounded-lg bg-base-300 animate-pulse" aria-label="Loading price" />;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-base-content/70">HBAR / USD from Chainlink</span>
      <span className="text-5xl font-semibold tabular-nums">{formatUsdPrice(price.answer, price.decimals)}</span>
      <span className="text-sm text-base-content/70">Updated {formatTimestamp(price.updatedAt)}</span>
    </div>
  );
};
