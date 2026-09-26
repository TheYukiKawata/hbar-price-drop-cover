const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export function formatTimestamp(unixSeconds: bigint): string {
  return DATE_TIME_FORMAT.format(new Date(Number(unixSeconds) * 1000));
}

export function formatDuration(totalSeconds: bigint): string {
  const seconds = Number(totalSeconds);
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(minutes, 1)}m`;
}

export function nowInSeconds(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}
