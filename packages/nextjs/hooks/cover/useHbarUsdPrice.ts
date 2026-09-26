import { Address } from "viem";
import { useReadContract } from "wagmi";
import { aggregatorAbi } from "~~/utils/cover/chainlink";

const PRICE_REFRESH_MS = 30_000;

export function useHbarUsdPrice(priceFeed: Address | undefined) {
  const { data: latestRound, error } = useReadContract({
    address: priceFeed,
    abi: aggregatorAbi,
    functionName: "latestRoundData",
    query: { enabled: priceFeed !== undefined, refetchInterval: PRICE_REFRESH_MS },
  });
  const { data: decimals } = useReadContract({
    address: priceFeed,
    abi: aggregatorAbi,
    functionName: "decimals",
    query: { enabled: priceFeed !== undefined },
  });

  if (!latestRound || decimals === undefined) return { price: undefined, error };
  const [, answer, , updatedAt] = latestRound;
  return { price: { answer, decimals, updatedAt }, error };
}
