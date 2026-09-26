import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Address } from "viem";
import { useAccount, useWriteContract } from "wagmi";
import { useTargetNetwork, useTransactor } from "~~/hooks/scaffold-hbar";
import { entityIdFromLongZeroAddress, mirrorNodeUrl } from "~~/utils/cover/hedera";
import { needsTokenAssociation } from "~~/utils/cover/mirrorNode";

const hrc719Abi = [
  {
    type: "function",
    name: "associate",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{ name: "responseCode", type: "int64" }],
  },
] as const;

export function usePolicyTokenAssociation(policyToken: Address | undefined) {
  const { address } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const { writeContractAsync, isPending } = useWriteContract();
  const transact = useTransactor();
  const queryClient = useQueryClient();
  const queryKey = ["needs-association", targetNetwork.id, address, policyToken];

  const { data: needsAssociation } = useQuery({
    queryKey,
    queryFn: () =>
      needsTokenAssociation(mirrorNodeUrl(targetNetwork.id), address!, entityIdFromLongZeroAddress(policyToken!)),
    enabled: address !== undefined && policyToken !== undefined,
  });

  async function associate() {
    if (!policyToken) return;
    await transact(() => writeContractAsync({ address: policyToken, abi: hrc719Abi, functionName: "associate" }));
    queryClient.setQueryData(queryKey, false);
  }

  return { needsAssociation, associate, isAssociating: isPending };
}
