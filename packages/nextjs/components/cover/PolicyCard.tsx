"use client";

import { useState } from "react";
import { Address } from "viem";
import { usePublicClient } from "wagmi";
import { CoverTerms } from "~~/hooks/cover/useCoverTerms";
import { useHbarUsdPrice } from "~~/hooks/cover/useHbarUsdPrice";
import { useScaffoldReadContract, useScaffoldWriteContract, useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { NoRoundBeforeError, findLastRoundBefore } from "~~/utils/cover/chainlink";
import { formatTinybars } from "~~/utils/cover/hbar";
import { entityIdFromLongZeroAddress, hashscanUrl } from "~~/utils/cover/hedera";
import { Policy, PolicyStatus, policyFromContractTuple } from "~~/utils/cover/policy";
import { formatUsdPrice } from "~~/utils/cover/price";
import { formatDuration, formatTimestamp, nowInSeconds } from "~~/utils/cover/time";
import { notification } from "~~/utils/scaffold-hbar";

const SETTLEMENT_GAS_LIMIT = 400_000n;

type PolicyCardProps = {
  policyId: bigint;
  terms: CoverTerms;
};

export const PolicyCard = ({ policyId, terms }: PolicyCardProps) => {
  const { targetNetwork } = useTargetNetwork();
  const { price } = useHbarUsdPrice(terms.priceFeed);
  const { data: policyTuple, isError: isPolicyError } = useScaffoldReadContract({
    contractName: "PriceDropCover",
    functionName: "policies",
    args: [policyId],
  });
  const { data: unclaimedPayout, isError: isUnclaimedPayoutError } = useScaffoldReadContract({
    contractName: "PriceDropCover",
    functionName: "unclaimedPayoutOf",
    args: [policyId],
  });

  if (isPolicyError || isUnclaimedPayoutError) {
    return (
      <li className="rounded-2xl bg-base-100 p-4 text-error shadow-sm">
        Could not read policy #{policyId.toString()}.
      </li>
    );
  }
  if (!policyTuple) return <li className="h-32 rounded-2xl bg-base-300 animate-pulse" />;

  const policy = policyFromContractTuple(policyTuple);
  const scheduleId = entityIdFromLongZeroAddress(policy.resolutionSchedule as Address);
  const isAwaitingResolution = policy.status === PolicyStatus.Active && nowInSeconds() >= policy.expiry;
  const canVoid = policy.status === PolicyStatus.Active && nowInSeconds() >= policy.expiry + terms.unresolvedVoidDelay;

  return (
    <li className="rounded-2xl bg-base-100 p-4 flex flex-col gap-2 shadow-sm">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-semibold">Policy #{policyId.toString()}</span>
        <StatusLabel policy={policy} isAwaitingResolution={isAwaitingResolution} unclaimedPayout={unclaimedPayout} />
      </div>
      <dl className="grid grid-cols-2 gap-2 m-0 text-sm">
        <dt className="text-base-content/70">Payout</dt>
        <dd className="m-0 text-right tabular-nums">{formatTinybars(policy.payout)} HBAR</dd>
        <dt className="text-base-content/70">Pays out below</dt>
        <dd className="m-0 text-right tabular-nums">
          {price ? formatUsdPrice(policy.strikePrice, price.decimals) : "Price feed unavailable"}
        </dd>
        <dt className="text-base-content/70">Expiry</dt>
        <dd className="m-0 text-right">{formatTimestamp(policy.expiry)}</dd>
      </dl>
      <a
        className="link text-sm w-fit"
        href={hashscanUrl(targetNetwork.id, "schedule", scheduleId)}
        target="_blank"
        rel="noreferrer"
      >
        Scheduled resolution {scheduleId}
      </a>
      <div className="flex flex-wrap gap-2">
        {isAwaitingResolution && (
          <ResolveButton policyId={policyId} expiry={policy.expiry} priceFeed={terms.priceFeed} />
        )}
        {canVoid && <VoidButton policyId={policyId} expiry={policy.expiry} priceFeed={terms.priceFeed} />}
        {unclaimedPayout !== undefined && unclaimedPayout > 0n && (
          <ClaimButton policyId={policyId} amount={unclaimedPayout} />
        )}
      </div>
    </li>
  );
};

type SettlementButtonProps = { policyId: bigint; expiry: bigint; priceFeed: Address };

type SettlementRoundSearch = { kind: "found"; roundId: bigint } | { kind: "none" } | { kind: "failed" };

function useSettlementRound({ expiry, priceFeed }: Omit<SettlementButtonProps, "policyId">) {
  const publicClient = usePublicClient();
  const [isSearching, setIsSearching] = useState(false);

  async function searchSettlementRound(): Promise<SettlementRoundSearch> {
    if (!publicClient) return { kind: "failed" };
    setIsSearching(true);
    try {
      return { kind: "found", roundId: await findLastRoundBefore(publicClient, priceFeed, expiry) };
    } catch (error) {
      if (error instanceof NoRoundBeforeError) return { kind: "none" };
      return { kind: "failed" };
    } finally {
      setIsSearching(false);
    }
  }

  return { searchSettlementRound, isSearching };
}

const FEED_READ_FAILED = "Could not read the Chainlink feed. Try again.";

const ResolveButton = ({ policyId, expiry, priceFeed }: SettlementButtonProps) => {
  const { searchSettlementRound, isSearching } = useSettlementRound({ expiry, priceFeed });
  const { writeContractAsync, isMining } = useScaffoldWriteContract({ contractName: "PriceDropCover" });

  async function resolveWithSettlementRound() {
    const search = await searchSettlementRound();
    if (search.kind === "failed") return notification.error(FEED_READ_FAILED);
    if (search.kind === "none") {
      return notification.error("The Chainlink feed has no round that can settle this policy.");
    }
    await writeContractAsync({
      functionName: "resolveWithRound",
      args: [policyId, search.roundId],
      gas: SETTLEMENT_GAS_LIMIT,
    });
  }

  return (
    <button className="btn btn-sm btn-outline" disabled={isSearching || isMining} onClick={resolveWithSettlementRound}>
      {isSearching || isMining ? "Resolving…" : "Resolve now"}
    </button>
  );
};

const VoidButton = ({ policyId, expiry, priceFeed }: SettlementButtonProps) => {
  const { searchSettlementRound, isSearching } = useSettlementRound({ expiry, priceFeed });
  const { writeContractAsync, isMining } = useScaffoldWriteContract({ contractName: "PriceDropCover" });

  async function voidIfUnsettleable() {
    const search = await searchSettlementRound();
    if (search.kind === "failed") return notification.error(FEED_READ_FAILED);
    if (search.kind === "found") {
      return notification.info("This policy can still be settled with a Chainlink round. Use Resolve now.");
    }
    await writeContractAsync({ functionName: "voidUnresolved", args: [policyId], gas: SETTLEMENT_GAS_LIMIT });
  }

  return (
    <button className="btn btn-sm btn-ghost" disabled={isSearching || isMining} onClick={voidIfUnsettleable}>
      {isSearching || isMining ? "Checking…" : "Void and refund the premium"}
    </button>
  );
};

const ClaimButton = ({ policyId, amount }: { policyId: bigint; amount: bigint }) => {
  const { writeContractAsync, isMining } = useScaffoldWriteContract({ contractName: "PriceDropCover" });

  return (
    <button
      className="btn btn-sm btn-primary"
      disabled={isMining}
      onClick={() => writeContractAsync({ functionName: "claimPayout", args: [policyId], gas: SETTLEMENT_GAS_LIMIT })}
    >
      {isMining ? "Claiming…" : `Claim ${formatTinybars(amount)} HBAR`}
    </button>
  );
};

type StatusLabelProps = {
  policy: Policy;
  isAwaitingResolution: boolean;
  unclaimedPayout: bigint | undefined;
};

const StatusLabel = ({ policy, isAwaitingResolution, unclaimedPayout }: StatusLabelProps) => {
  if (isAwaitingResolution) return <span className="badge badge-warning">Awaiting resolution</span>;
  if (unclaimedPayout !== undefined && unclaimedPayout > 0n) {
    return <span className="badge badge-success">Payout waiting for your claim</span>;
  }

  switch (policy.status) {
    case PolicyStatus.Active:
      return <span className="badge badge-info">Active, {formatDuration(policy.expiry - nowInSeconds())} left</span>;
    case PolicyStatus.PaidOut:
      return <span className="badge badge-success">Paid out</span>;
    case PolicyStatus.Expired:
      return <span className="badge badge-ghost">Expired, no payout</span>;
    case PolicyStatus.Voided:
      return <span className="badge badge-ghost">Voided, premium refunded</span>;
    case PolicyStatus.None:
      return null;
  }
};
