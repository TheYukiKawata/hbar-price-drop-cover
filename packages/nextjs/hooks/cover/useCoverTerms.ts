import { useScaffoldReadContract } from "~~/hooks/scaffold-hbar";

export function useCoverTerms() {
  const { data: priceFeed } = useScaffoldReadContract({ contractName: "PriceDropCover", functionName: "priceFeed" });
  const { data: policyToken } = useScaffoldReadContract({
    contractName: "PriceDropCover",
    functionName: "policyToken",
  });
  const { data: triggerDropBps } = useScaffoldReadContract({
    contractName: "PriceDropCover",
    functionName: "triggerDropBps",
  });
  const { data: premiumBps } = useScaffoldReadContract({ contractName: "PriceDropCover", functionName: "premiumBps" });
  const { data: coverPeriod } = useScaffoldReadContract({
    contractName: "PriceDropCover",
    functionName: "coverPeriod",
  });
  const { data: maxPriceAge } = useScaffoldReadContract({
    contractName: "PriceDropCover",
    functionName: "maxPriceAge",
  });

  const isLoaded =
    priceFeed !== undefined &&
    policyToken !== undefined &&
    triggerDropBps !== undefined &&
    premiumBps !== undefined &&
    coverPeriod !== undefined &&
    maxPriceAge !== undefined;

  if (!isLoaded) return undefined;
  return { priceFeed, policyToken, triggerDropBps, premiumBps, coverPeriod, maxPriceAge };
}

export type CoverTerms = NonNullable<ReturnType<typeof useCoverTerms>>;
