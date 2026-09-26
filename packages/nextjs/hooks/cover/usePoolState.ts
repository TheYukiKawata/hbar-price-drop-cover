import { useAccount } from "wagmi";
import { useScaffoldReadContract } from "~~/hooks/scaffold-hbar";

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
  const myAssetsRead = useScaffoldReadContract({
    contractName: "PriceDropCover",
    functionName: "assetsOf",
    args: [address],
  });

  const isError = [
    totalAssetsRead,
    lockedCapitalRead,
    freeCapitalRead,
    totalSharesRead,
    mySharesRead,
    myAssetsRead,
  ].some(read => read.isError);

  const totalAssets = totalAssetsRead.data;
  const lockedCapital = lockedCapitalRead.data;
  const freeCapital = freeCapitalRead.data;
  const totalShares = totalSharesRead.data;
  const isLoaded =
    totalAssets !== undefined && lockedCapital !== undefined && freeCapital !== undefined && totalShares !== undefined;
  if (!isLoaded) return { pool: undefined, isError };

  return {
    pool: {
      totalAssets,
      lockedCapital,
      freeCapital,
      totalShares,
      myShares: mySharesRead.data ?? 0n,
      myAssets: myAssetsRead.data ?? 0n,
    },
    isError,
  };
}

export type PoolState = NonNullable<ReturnType<typeof usePoolState>["pool"]>;
