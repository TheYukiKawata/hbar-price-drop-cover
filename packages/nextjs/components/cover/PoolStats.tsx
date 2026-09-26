import { PoolState } from "~~/hooks/cover/usePoolState";
import { formatTinybars } from "~~/utils/cover/hbar";

export const PoolStats = ({ pool }: { pool: PoolState }) => {
  const stats = [
    { label: "Pool assets", value: pool.totalAssets, isError: false },
    { label: "Backing active policies", value: pool.lockedCapital, isError: false },
    { label: "Free to underwrite or withdraw", value: pool.freeCapital, isError: false },
    { label: "You can withdraw", value: pool.withdrawable, isError: pool.isWithdrawableError },
  ];

  return (
    <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 m-0">
      {stats.map(({ label, value, isError }) => (
        <div key={label} className="rounded-2xl bg-base-100 p-4 flex flex-col gap-1 shadow-sm">
          <dt className="text-sm text-base-content/70">{label}</dt>
          <dd className="m-0 text-2xl font-semibold tabular-nums">
            <StatValue value={value} isError={isError} />
          </dd>
        </div>
      ))}
    </dl>
  );
};

const StatValue = ({ value, isError }: { value: bigint | undefined; isError: boolean }) => {
  if (value !== undefined) return <>{formatTinybars(value)} HBAR</>;
  if (isError) return <span className="text-base text-error">Could not read</span>;
  return <StatLoading />;
};

const StatLoading = () => <span className="block h-8 w-24 rounded-lg bg-base-300 animate-pulse" aria-label="Loading" />;
