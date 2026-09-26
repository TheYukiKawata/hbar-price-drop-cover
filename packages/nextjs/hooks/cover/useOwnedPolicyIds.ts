import { useQuery } from "@tanstack/react-query";
import { Address } from "viem";
import { useAccount } from "wagmi";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { entityIdFromLongZeroAddress, mirrorNodeUrl } from "~~/utils/cover/hedera";
import { fetchOwnedSerialNumbers } from "~~/utils/cover/mirrorNode";

const MIRROR_REFRESH_MS = 15_000;

export function useOwnedPolicyIds(policyToken: Address | undefined) {
  const { address } = useAccount();
  const { targetNetwork } = useTargetNetwork();

  return useQuery({
    queryKey: ["owned-policy-ids", targetNetwork.id, address, policyToken],
    queryFn: () =>
      fetchOwnedSerialNumbers(mirrorNodeUrl(targetNetwork.id), address!, entityIdFromLongZeroAddress(policyToken!)),
    enabled: address !== undefined && policyToken !== undefined,
    refetchInterval: MIRROR_REFRESH_MS,
  });
}
