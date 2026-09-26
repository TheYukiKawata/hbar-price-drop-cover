import { Address, BaseError, ContractFunctionRevertedError, ExecutionRevertedError, PublicClient } from "viem";

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
const MAX_ROUND_INDEX = (1n << PHASE_ID_SHIFT) - 1n;

export class NoRoundBeforeError extends Error {
  constructor(timestamp: bigint) {
    super(`The Chainlink feed has no round before ${timestamp}.`);
  }
}

function isRevert(error: unknown) {
  return (
    error instanceof BaseError &&
    error.walk(cause => cause instanceof ContractFunctionRevertedError || cause instanceof ExecutionRevertedError) !==
      null
  );
}

function phaseOf(roundId: bigint) {
  return roundId >> PHASE_ID_SHIFT;
}

function roundInPhase(phaseId: bigint, index: bigint) {
  return (phaseId << PHASE_ID_SHIFT) | index;
}

export async function findLastRoundBefore(client: PublicClient, feed: Address, timestamp: bigint): Promise<bigint> {
  const updatedAtOf = async (roundId: bigint) => {
    try {
      const [, , , updatedAt] = await client.readContract({
        address: feed,
        abi: aggregatorAbi,
        functionName: "getRoundData",
        args: [roundId],
      });
      return updatedAt;
    } catch (error) {
      if (isRevert(error)) return 0n;
      throw error;
    }
  };

  const lastIndexInPhase = async (phaseId: bigint) => {
    let known = 0n;
    let probe = 1n;
    while (probe <= MAX_ROUND_INDEX && (await updatedAtOf(roundInPhase(phaseId, probe))) > 0n) {
      known = probe;
      probe *= 2n;
    }
    let missing = probe;
    while (missing - known > 1n) {
      const middle = (known + missing) / 2n;
      if ((await updatedAtOf(roundInPhase(phaseId, middle))) > 0n) known = middle;
      else missing = middle;
    }
    return known;
  };

  const lastIndexBefore = async (phaseId: bigint, lastIndex: bigint) => {
    let before = 1n;
    let after = lastIndex + 1n;
    while (after - before > 1n) {
      const middle = (before + after) / 2n;
      if ((await updatedAtOf(roundInPhase(phaseId, middle))) <= timestamp) before = middle;
      else after = middle;
    }
    return before;
  };

  const [latestRoundId, , , latestUpdatedAt] = await client.readContract({
    address: feed,
    abi: aggregatorAbi,
    functionName: "latestRoundData",
  });
  if (latestUpdatedAt > 0n && latestUpdatedAt <= timestamp) return latestRoundId;

  let lastIndex = latestRoundId - roundInPhase(phaseOf(latestRoundId), 0n);
  let nextPhaseHasRounds = false;
  for (let phaseId = phaseOf(latestRoundId); phaseId > 0n; phaseId--) {
    const firstUpdatedAt = lastIndex > 0n ? await updatedAtOf(roundInPhase(phaseId, 1n)) : 0n;
    if (firstUpdatedAt > 0n && firstUpdatedAt <= timestamp) {
      const index = await lastIndexBefore(phaseId, lastIndex);
      const isProvable = index < lastIndex || nextPhaseHasRounds;
      if (!isProvable) break;
      return roundInPhase(phaseId, index);
    }
    nextPhaseHasRounds = lastIndex > 0n;
    lastIndex = await lastIndexInPhase(phaseId - 1n);
  }
  throw new NoRoundBeforeError(timestamp);
}
