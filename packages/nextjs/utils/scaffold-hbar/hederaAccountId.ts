import { MIRROR_NODE_URLS } from "~~/utils/cover/hedera";

export type HederaNetwork = "testnet" | "mainnet";

const CHAIN_ID_TO_NETWORK: Record<number, HederaNetwork> = {
  295: "mainnet",
  296: "testnet",
};

/** Maps a viem/wagmi chain ID to "testnet" | "mainnet". Defaults to "testnet". */
export function chainIdToHederaNetwork(chainId: number): HederaNetwork {
  return CHAIN_ID_TO_NETWORK[chainId] ?? "testnet";
}

/**
 * Returns the Hedera account ID (e.g. "0.0.8041897") for an EVM address.
 *
 * @param evmAddress - EVM address (0x...)
 * @param network - "testnet" (default) or "mainnet"
 * @returns Hedera account ID or null if not found
 */
export async function getHederaAccountId(
  evmAddress: string,
  network: HederaNetwork = "testnet",
): Promise<string | null> {
  const res = await fetch(`${MIRROR_NODE_URLS[network]}/api/v1/accounts/${evmAddress}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Mirror node request failed with HTTP ${res.status}`);

  const data = (await res.json()) as { account?: unknown };
  return typeof data.account === "string" ? data.account : null;
}
