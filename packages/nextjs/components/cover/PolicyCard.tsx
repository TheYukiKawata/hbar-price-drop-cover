"use client";

import { Address } from "viem";
import { useHbarUsdPrice } from "~~/hooks/cover/useHbarUsdPrice";
import { useScaffoldReadContract, useScaffoldWriteContract, useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { formatTinybars } from "~~/utils/cover/hbar";
import { entityIdFromLongZeroAddress, hashscanUrl } from "~~/utils/cover/hedera";
import { Policy, PolicyStatus, policyFromContractTuple } from "~~/utils/cover/policy";
import { formatUsdPrice } from "~~/utils/cover/price";
import { formatDuration, formatTimestamp, nowInSeconds } from "~~/utils/cover/time";

const RESOLVE_GAS_LIMIT = 400_000n;

type PolicyCardProps = {
  policyId: bigint;
  priceFeed: Address;
};

export const PolicyCard = ({ policyId, priceFeed }: PolicyCardProps) => {
  const { targetNetwork } = useTargetNetwork();
  const { price } = useHbarUsdPrice(priceFeed);
  const { data: policyTuple } = useScaffoldReadContract({
    contractName: "PriceDropCover",
    functionName: "policies",
    args: [policyId],
  });
  const { writeContractAsync, isMining } = useScaffoldWriteContract({ contractName: "PriceDropCover" });

  if (!policyTuple || !price) return <li className="h-32 rounded-2xl bg-base-300 animate-pulse" />;

  const policy = policyFromContractTuple(policyTuple);
  const scheduleId = entityIdFromLongZeroAddress(policy.resolutionSchedule as Address);
  const isAwaitingResolution = policy.status === PolicyStatus.Active && nowInSeconds() >= policy.expiry;

  return (
    <li className="rounded-2xl bg-base-100 p-4 flex flex-col gap-2 shadow-sm">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-semibold">Policy #{policyId.toString()}</span>
        <StatusLabel policy={policy} isAwaitingResolution={isAwaitingResolution} />
      </div>
      <dl className="grid grid-cols-2 gap-2 m-0 text-sm">
        <dt className="text-base-content/70">Payout</dt>
        <dd className="m-0 text-right tabular-nums">{formatTinybars(policy.payout)} HBAR</dd>
        <dt className="text-base-content/70">Pays out below</dt>
        <dd className="m-0 text-right tabular-nums">{formatUsdPrice(policy.strikePrice, price.decimals)}</dd>
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
      {isAwaitingResolution && (
        <button
          className="btn btn-sm btn-outline w-fit"
          disabled={isMining}
          onClick={() => writeContractAsync({ functionName: "resolve", args: [policyId], gas: RESOLVE_GAS_LIMIT })}
        >
          {isMining ? "Resolving…" : "Resolve now"}
        </button>
      )}
    </li>
  );
};

const StatusLabel = ({ policy, isAwaitingResolution }: { policy: Policy; isAwaitingResolution: boolean }) => {
  if (isAwaitingResolution) return <span className="badge badge-warning">Awaiting resolution</span>;

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
