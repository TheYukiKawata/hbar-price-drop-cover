import { useAccount } from "wagmi";
import { useScaffoldReadContract } from "~~/hooks/scaffold-hbar";

export function usePoolState() {
  const { address } = useAccount();
  const { data: totalAssets } = useScaffoldReadContract({
    contractName: "PriceDropCover",
    functionName: "totalAssets",
  });
  const { data: lockedCapital } = useScaffoldReadContract({
    contractName: "PriceDropCover",
    functionName: "lockedCapital",
  });
  const { data: freeCapital } = useScaffoldReadContract({
    contractName: "PriceDropCover",
    functionName: "freeCapital",
  });
  const { data: totalShares } = useScaffoldReadContract({
    contractName: "PriceDropCover",
    functionName: "totalShares",
  });
  const { data: myShares } = useScaffoldReadContract({
    contractName: "PriceDropCover",
    functionName: "sharesOf",
    args: [address],
  });
  const { data: myAssets } = useScaffoldReadContract({
    contractName: "PriceDropCover",
    functionName: "assetsOf",
    args: [address],
  });

  const isLoaded =
    totalAssets !== undefined && lockedCapital !== undefined && freeCapital !== undefined && totalShares !== undefined;

  if (!isLoaded) return undefined;
  return { totalAssets, lockedCapital, freeCapital, totalShares, myShares: myShares ?? 0n, myAssets: myAssets ?? 0n };
}

export type PoolState = NonNullable<ReturnType<typeof usePoolState>>;
