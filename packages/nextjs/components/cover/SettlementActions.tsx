"use client";

import { useState } from "react";
import { Address, BaseError, ContractFunctionRevertedError } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { useDeployedContractInfo, useScaffoldWriteContract } from "~~/hooks/scaffold-hbar";
import { NoRoundBeforeError, findLastRoundBefore } from "~~/utils/cover/chainlink";
import { notification } from "~~/utils/scaffold-hbar";

export const SETTLEMENT_GAS_LIMIT = 400_000n;

const FEED_READ_FAILED = "Could not read the Chainlink feed. Try again.";

type SettlementPolicy = { policyId: bigint; expiry: bigint; priceFeed: Address };

type SettlementRoundSearch = { kind: "found"; roundId: bigint } | { kind: "none" } | { kind: "failed" };

type ResolveRevertReason = "noRoundFound" | "alreadySettled" | "notExpired" | "otherContractError";

type ResolveSimulation = { kind: "succeeds" } | { kind: "reverts"; reason: ResolveRevertReason } | { kind: "failed" };

type SettlementAction = "resolve" | "void";

type SettlementActionsProps = SettlementPolicy & { canResolve: boolean; canVoid: boolean };

export const SettlementActions = ({ canResolve, canVoid, ...policy }: SettlementActionsProps) => {
  const searchSettlementRound = useSettlementRoundSearch(policy);
  const simulateResolve = useResolveSimulation(policy.policyId);
  const { writeContractAsync } = useScaffoldWriteContract({ contractName: "PriceDropCover" });
  const { runningAction, runAction } = useSettlementActionRunner();
  const { policyId } = policy;

  async function sendResolve() {
    await writeContractAsync({ functionName: "resolve", args: [policyId], gas: SETTLEMENT_GAS_LIMIT });
  }

  async function resolveNow() {
    const search = await searchSettlementRound();
    if (search.kind === "failed") return notification.error(FEED_READ_FAILED);
    if (search.kind === "found") {
      return writeContractAsync({
        functionName: "resolveWithRound",
        args: [policyId, search.roundId],
        gas: SETTLEMENT_GAS_LIMIT,
      });
    }
    const simulation = await simulateResolve();
    if (simulation.kind === "succeeds") return sendResolve();
    if (simulation.kind === "failed") return notification.error(FEED_READ_FAILED);
    notification.error(resolveRevertMessage(simulation.reason));
  }

  async function voidIfUnsettleable() {
    const search = await searchSettlementRound();
    if (search.kind === "failed") return notification.error(FEED_READ_FAILED);
    if (search.kind === "found") {
      return notification.info("This policy can still be settled with a Chainlink round. Use Resolve now.");
    }
    const simulation = await simulateResolve();
    if (simulation.kind === "succeeds") {
      notification.info("The contract can still settle this policy, so it will be resolved instead of voided.");
      return sendResolve();
    }
    if (simulation.kind === "failed") return notification.error(FEED_READ_FAILED);
    if (simulation.reason !== "noRoundFound") return notification.error(resolveRevertMessage(simulation.reason));
    await writeContractAsync({ functionName: "voidUnresolved", args: [policyId], gas: SETTLEMENT_GAS_LIMIT });
  }

  const isRunning = runningAction !== undefined;

  return (
    <>
      {canResolve && (
        <button
          className="btn btn-sm btn-outline"
          disabled={isRunning}
          onClick={() => runAction("resolve", resolveNow)}
        >
          {runningAction === "resolve" ? "Resolving…" : "Resolve now"}
        </button>
      )}
      {canVoid && (
        <button
          className="btn btn-sm btn-ghost"
          disabled={isRunning}
          onClick={() => runAction("void", voidIfUnsettleable)}
        >
          {runningAction === "void" ? "Checking…" : "Void and refund the premium"}
        </button>
      )}
    </>
  );
};

function resolveRevertMessage(reason: ResolveRevertReason) {
  switch (reason) {
    case "noRoundFound":
      return "The Chainlink feed has no round that can settle this policy.";
    case "alreadySettled":
      return "This policy is already settled.";
    case "notExpired":
      return "Hedera has not reached this policy's expiry yet. Try again in a minute.";
    case "otherContractError":
      return "The contract cannot settle this policy.";
  }
}

function useSettlementActionRunner() {
  const [runningAction, setRunningAction] = useState<SettlementAction>();

  async function runAction(action: SettlementAction, task: () => Promise<unknown>) {
    setRunningAction(action);
    await task().catch(ignoreErrorTheTransactorNotified);
    setRunningAction(undefined);
  }

  return { runningAction, runAction };
}

function ignoreErrorTheTransactorNotified() {
  return undefined;
}

function useSettlementRoundSearch({ expiry, priceFeed }: SettlementPolicy) {
  const publicClient = usePublicClient();

  return async function searchSettlementRound(): Promise<SettlementRoundSearch> {
    if (!publicClient) return { kind: "failed" };
    try {
      return { kind: "found", roundId: await findLastRoundBefore(publicClient, priceFeed, expiry) };
    } catch (error) {
      if (error instanceof NoRoundBeforeError) return { kind: "none" };
      return { kind: "failed" };
    }
  };
}

function useResolveSimulation(policyId: bigint) {
  const publicClient = usePublicClient();
  const { address } = useAccount();
  const { data: cover } = useDeployedContractInfo({ contractName: "PriceDropCover" });

  return async function simulateResolve(): Promise<ResolveSimulation> {
    if (!publicClient || !cover) return { kind: "failed" };
    try {
      await publicClient.simulateContract({
        address: cover.address,
        abi: cover.abi,
        functionName: "resolve",
        args: [policyId],
        account: address,
      });
      return { kind: "succeeds" };
    } catch (error) {
      const errorName = decodedRevertErrorName(error);
      if (errorName === undefined) return { kind: "failed" };
      return { kind: "reverts", reason: resolveRevertReason(errorName) };
    }
  };
}

function decodedRevertErrorName(error: unknown) {
  if (!(error instanceof BaseError)) return undefined;
  const revert = error.walk(cause => cause instanceof ContractFunctionRevertedError);
  if (!(revert instanceof ContractFunctionRevertedError)) return undefined;
  return revert.data?.errorName;
}

function resolveRevertReason(errorName: string): ResolveRevertReason {
  switch (errorName) {
    case "NoRoundFoundBefore":
      return "noRoundFound";
    case "PolicyNotActive":
      return "alreadySettled";
    case "CoverNotExpired":
      return "notExpired";
    default:
      return "otherContractError";
  }
}
