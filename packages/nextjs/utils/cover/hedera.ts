import { Address } from "viem";

export type HederaNetworkName = "testnet" | "mainnet";

const NETWORK_BY_CHAIN_ID: Record<number, HederaNetworkName> = {
  295: "mainnet",
  296: "testnet",
};

export const MIRROR_NODE_URLS: Record<HederaNetworkName, string> = {
  testnet: "https://testnet.mirrornode.hedera.com",
  mainnet: "https://mainnet-public.mirrornode.hedera.com",
};

export function hederaNetworkOf(chainId: number): HederaNetworkName {
  return NETWORK_BY_CHAIN_ID[chainId] ?? "testnet";
}

export function mirrorNodeUrl(chainId: number): string {
  return MIRROR_NODE_URLS[hederaNetworkOf(chainId)];
}

export function entityIdFromLongZeroAddress(address: Address): string {
  return `0.0.${BigInt(address)}`;
}

export function hashscanUrl(chainId: number, entity: "contract" | "token" | "schedule", id: string): string {
  return `https://hashscan.io/${hederaNetworkOf(chainId)}/${entity}/${id}`;
}
