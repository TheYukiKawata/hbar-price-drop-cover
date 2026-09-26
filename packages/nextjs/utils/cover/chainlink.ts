import { Address, PublicClient } from "viem";

const roundDataOutputs = [
  { name: "roundId", type: "uint80" },
  { name: "answer", type: "int256" },
  { name: "startedAt", type: "uint256" },
  { name: "updatedAt", type: "uint256" },
  { name: "answeredInRound", type: "uint80" },
] as const;

export const aggregatorAbi = [
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: roundDataOutputs,
  },
  {
    type: "function",
    name: "getRoundData",
    stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint80" }],
    outputs: roundDataOutputs,
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

const PHASE_ID_SHIFT = 64n;

export class NoRoundBeforeError extends Error {
  constructor(timestamp: bigint) {
    super(`The Chainlink feed has no round before ${timestamp} in its current phase.`);
  }
}

export async function findLastRoundBefore(client: PublicClient, feed: Address, timestamp: bigint): Promise<bigint> {
  const updatedAtOf = async (roundId: bigint) => {
    const [, , , updatedAt] = await client.readContract({
      address: feed,
      abi: aggregatorAbi,
      functionName: "getRoundData",
      args: [roundId],
    });
    return updatedAt;
  };

  const [latestRoundId, , , latestUpdatedAt] = await client.readContract({
    address: feed,
    abi: aggregatorAbi,
    functionName: "latestRoundData",
  });
  if (latestUpdatedAt <= timestamp) return latestRoundId;

  const firstRoundInPhase = ((latestRoundId >> PHASE_ID_SHIFT) << PHASE_ID_SHIFT) | 1n;
  if ((await updatedAtOf(firstRoundInPhase)) > timestamp) throw new NoRoundBeforeError(timestamp);

  let lastBefore = firstRoundInPhase;
  let firstAfter = latestRoundId;
  while (firstAfter - lastBefore > 1n) {
    const middle = (lastBefore + firstAfter) / 2n;
    if ((await updatedAtOf(middle)) <= timestamp) lastBefore = middle;
    else firstAfter = middle;
  }
  return lastBefore;
}
