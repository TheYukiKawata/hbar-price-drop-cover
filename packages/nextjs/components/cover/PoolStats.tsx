import { PoolState } from "~~/hooks/cover/usePoolState";
import { formatTinybars } from "~~/utils/cover/hbar";

export const PoolStats = ({ pool }: { pool: PoolState }) => {
  const stats = [
    { label: "Pool assets", value: pool.totalAssets },
    { label: "Backing active policies", value: pool.lockedCapital },
    { label: "Free to underwrite or withdraw", value: pool.freeCapital },
    { label: "You can withdraw", value: pool.withdrawable },
  ];

  return (
    <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 m-0">
      {stats.map(({ label, value }) => (
        <div key={label} className="rounded-2xl bg-base-100 p-4 flex flex-col gap-1 shadow-sm">
          <dt className="text-sm text-base-content/70">{label}</dt>
          <dd className="m-0 text-2xl font-semibold tabular-nums">
            {value === undefined ? <StatLoading /> : `${formatTinybars(value)} HBAR`}
          </dd>
        </div>
      ))}
    </dl>
  );
};

const StatLoading = () => <span className="block h-8 w-24 rounded-lg bg-base-300 animate-pulse" aria-label="Loading" />;
