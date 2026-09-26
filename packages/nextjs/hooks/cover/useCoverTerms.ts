import { isAddress } from "viem";
import { useScaffoldReadContract } from "~~/hooks/scaffold-hbar";

export function useCoverTerms() {
  const priceFeedRead = useScaffoldReadContract({ contractName: "PriceDropCover", functionName: "priceFeed" });
  const policyTokenRead = useScaffoldReadContract({ contractName: "PriceDropCover", functionName: "policyToken" });
  const triggerDropBpsRead = useScaffoldReadContract({
    contractName: "PriceDropCover",
    functionName: "triggerDropBps",
  });
  const premiumBpsRead = useScaffoldReadContract({ contractName: "PriceDropCover", functionName: "premiumBps" });
  const coverPeriodRead = useScaffoldReadContract({ contractName: "PriceDropCover", functionName: "coverPeriod" });
  const maxPriceAgeRead = useScaffoldReadContract({ contractName: "PriceDropCover", functionName: "maxPriceAge" });
  const resolutionFeeRead = useScaffoldReadContract({ contractName: "PriceDropCover", functionName: "resolutionFee" });
  const unresolvedVoidDelayRead = useScaffoldReadContract({
    contractName: "PriceDropCover",
    functionName: "UNRESOLVED_VOID_DELAY",
  });

  const isError = [
    priceFeedRead,
    policyTokenRead,
    triggerDropBpsRead,
    premiumBpsRead,
    coverPeriodRead,
    maxPriceAgeRead,
    resolutionFeeRead,
    unresolvedVoidDelayRead,
  ].some(read => read.isError);

  const priceFeed = priceFeedRead.data;
  const policyToken = policyTokenRead.data;
  const triggerDropBps = triggerDropBpsRead.data;
  const premiumBps = premiumBpsRead.data;
  const coverPeriod = coverPeriodRead.data;
  const maxPriceAge = maxPriceAgeRead.data;
  const resolutionFee = resolutionFeeRead.data;
  const unresolvedVoidDelay = unresolvedVoidDelayRead.data;

  const isLoaded =
    priceFeed !== undefined &&
    policyToken !== undefined &&
    triggerDropBps !== undefined &&
    premiumBps !== undefined &&
    coverPeriod !== undefined &&
    maxPriceAge !== undefined &&
    resolutionFee !== undefined &&
    unresolvedVoidDelay !== undefined;
  if (!isLoaded || !isAddress(priceFeed) || !isAddress(policyToken)) return { terms: undefined, isError };

  return {
    terms: {
      priceFeed,
      policyToken,
      triggerDropBps,
      premiumBps,
      coverPeriod,
      maxPriceAge,
      resolutionFee,
      unresolvedVoidDelay,
    },
    isError,
  };
}

export type CoverTerms = NonNullable<ReturnType<typeof useCoverTerms>["terms"]>;
