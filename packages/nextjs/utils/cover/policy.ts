export enum PolicyStatus {
  None = 0,
  Active = 1,
  PaidOut = 2,
  Expired = 3,
  Voided = 4,
}

export type Policy = {
  payout: bigint;
  premium: bigint;
  strikePrice: bigint;
  expiry: bigint;
  status: PolicyStatus;
  resolutionSchedule: string;
};

export function policyFromContractTuple(tuple: readonly [bigint, bigint, bigint, bigint, number, string]): Policy {
  const [payout, premium, strikePrice, expiry, status, resolutionSchedule] = tuple;
  return { payout, premium, strikePrice, expiry, status: status as PolicyStatus, resolutionSchedule };
}
