import { formatUnits, parseUnits } from "viem";

const TINYBAR_DECIMALS = 8;
const WEIBAR_PER_TINYBAR = 10n ** 10n;

export function parseHbarToTinybars(text: string): bigint | undefined {
  const trimmed = text.trim();
  if (!/^\d+(\.\d{1,8})?$/.test(trimmed)) return undefined;
  return parseUnits(trimmed, TINYBAR_DECIMALS);
}

export function formatTinybars(tinybars: bigint, maximumFractionDigits = 4): string {
  const hbar = Number(formatUnits(tinybars, TINYBAR_DECIMALS));
  return hbar.toLocaleString("en-US", { maximumFractionDigits });
}

export function tinybarsToWeibar(tinybars: bigint): bigint {
  return tinybars * WEIBAR_PER_TINYBAR;
}
