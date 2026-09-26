import { Address } from "viem";
import { useReadContract } from "wagmi";

const aggregatorAbi = [
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

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
