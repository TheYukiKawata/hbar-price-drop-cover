"use client";

import { CoverTerms, useCoverTerms } from "~~/hooks/cover/useCoverTerms";
import { useDeployedContractInfo } from "~~/hooks/scaffold-hbar";
import { ZERO_ADDRESS } from "~~/utils/scaffold-hbar/common";

type WithCoverTermsProps = {
  children: (terms: CoverTerms) => React.ReactNode;
};

export const WithCoverTerms = ({ children }: WithCoverTermsProps) => {
  const { data: deployedCover, isLoading } = useDeployedContractInfo({ contractName: "PriceDropCover" });
  const { terms, isError } = useCoverTerms();

  if (!isLoading && !deployedCover) {
    return (
      <p className="m-0 rounded-2xl bg-base-200 p-8">
        PriceDropCover is not deployed on this network. Run <code>yarn hardhat:deploy --network hederaTestnet</code>.
      </p>
    );
  }
  if (isError && !terms) {
    return (
      <p className="m-0 rounded-2xl bg-base-200 p-8 text-error">
        Could not read the cover terms from Hedera testnet. Check your connection and reload the page.
      </p>
    );
  }
  if (!terms) return <div className="h-64 rounded-2xl bg-base-300 animate-pulse" aria-label="Loading cover terms" />;
  if (terms.policyToken === ZERO_ADDRESS) {
    return (
      <p className="m-0 rounded-2xl bg-base-200 p-8">
        The policy NFT collection does not exist yet. Call <code>createPolicyToken</code> from Debug Contracts with the
        HTS creation fee.
      </p>
    );
  }
  return children(terms);
};
