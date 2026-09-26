"use client";

import { useAccount } from "wagmi";
import { PolicyCard } from "~~/components/cover/PolicyCard";
import { CoverTerms } from "~~/hooks/cover/useCoverTerms";
import { useOwnedPolicyIds } from "~~/hooks/cover/useOwnedPolicyIds";

export const MyPolicies = ({ terms }: { terms: CoverTerms }) => {
  const { isConnected } = useAccount();
  const { data: policyIds, isPending, error } = useOwnedPolicyIds(terms.policyToken);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold m-0">Your policies</h2>
      <PolicyListBody isConnected={isConnected} isPending={isPending} hasError={error !== null} policyIds={policyIds}>
        {policyIds?.map(policyId => (
          <PolicyCard key={policyId.toString()} policyId={policyId} terms={terms} />
        ))}
      </PolicyListBody>
    </section>
  );
};

type PolicyListBodyProps = {
  isConnected: boolean;
  isPending: boolean;
  hasError: boolean;
  policyIds: bigint[] | undefined;
  children: React.ReactNode;
};

const PolicyListBody = ({ isConnected, isPending, hasError, policyIds, children }: PolicyListBodyProps) => {
  if (!isConnected) return <p className="m-0 text-base-content/70">Connect a wallet to see your policies.</p>;
  if (hasError) return <p className="m-0 text-error">Could not load your policies from the mirror node.</p>;
  if (isPending) return <div className="h-32 rounded-2xl bg-base-300 animate-pulse" aria-label="Loading policies" />;
  if (!policyIds?.length) return <p className="m-0 text-base-content/70">You hold no policies yet.</p>;
  return <ul className="grid gap-4 md:grid-cols-2 p-0 m-0 list-none">{children}</ul>;
};
