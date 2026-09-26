import { useAccount } from "wagmi";
import { useScaffoldReadContract } from "~~/hooks/scaffold-hbar";

type ShareLimits = {
  lockedCapital: bigint;
  totalShares: bigint;
  minSharesBackingPolicies: bigint;
  myShares: bigint;
};

function maxSharesToWithdraw({ lockedCapital, totalShares, minSharesBackingPolicies, myShares }: ShareLimits) {
  if (lockedCapital === 0n) return myShares;
  const withdrawableFromPool = totalShares - minSharesBackingPolicies;
  if (withdrawableFromPool <= 0n) return 0n;
  return myShares < withdrawableFromPool ? myShares : withdrawableFromPool;
}

export function usePoolState() {
  const { address } = useAccount();
  const totalAssetsRead = useScaffoldReadContract({ contractName: "PriceDropCover", functionName: "totalAssets" });
  const lockedCapitalRead = useScaffoldReadContract({ contractName: "PriceDropCover", functionName: "lockedCapital" });
  const freeCapitalRead = useScaffoldReadContract({ contractName: "PriceDropCover", functionName: "freeCapital" });
  const totalSharesRead = useScaffoldReadContract({ contractName: "PriceDropCover", functionName: "totalShares" });
  const mySharesRead = useScaffoldReadContract({
    contractName: "PriceDropCover",
    functionName: "sharesOf",
    args: [address],
  });
  const minSharesBackingPoliciesRead = useScaffoldReadContract({
    contractName: "PriceDropCover",
    functionName: "MIN_SHARES_BACKING_POLICIES",
  });

  const isError = [
    totalAssetsRead,
    lockedCapitalRead,
    freeCapitalRead,
    totalSharesRead,
    mySharesRead,
    minSharesBackingPoliciesRead,
  ].some(read => read.isError);

  const totalAssets = totalAssetsRead.data;
  const lockedCapital = lockedCapitalRead.data;
  const freeCapital = freeCapitalRead.data;
  const totalShares = totalSharesRead.data;
  const minSharesBackingPolicies = minSharesBackingPoliciesRead.data;
  const myShares = address === undefined ? 0n : mySharesRead.data;
  const isLoaded =
    totalAssets !== undefined &&
    lockedCapital !== undefined &&
    freeCapital !== undefined &&
    totalShares !== undefined &&
    minSharesBackingPolicies !== undefined &&
    myShares !== undefined;
  const maxWithdrawShares = isLoaded
    ? maxSharesToWithdraw({ lockedCapital, totalShares, minSharesBackingPolicies, myShares })
    : 0n;
  const withdrawableRead = useScaffoldReadContract({
    contractName: "PriceDropCover",
    functionName: "previewRedeem",
    args: [maxWithdrawShares],
    query: { enabled: isLoaded },
  });
  const hasError = isError || withdrawableRead.isError;
  if (!isLoaded) return { pool: undefined, isError: hasError };

  return {
    pool: {
      totalAssets,
      lockedCapital,
      freeCapital,
      totalShares,
      minSharesBackingPolicies,
      myShares,
      maxWithdrawShares,
      withdrawable: withdrawableRead.data,
    },
    isError: hasError,
  };
}

export type PoolState = NonNullable<ReturnType<typeof usePoolState>["pool"]>;
