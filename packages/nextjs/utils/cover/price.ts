import { formatUnits } from "viem";

export function formatUsdPrice(answer: bigint, decimals: number): string {
  const usd = Number(formatUnits(answer, decimals));
  return usd.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4 });
}

export function formatBps(bps: bigint): string {
  return `${(Number(bps) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}
