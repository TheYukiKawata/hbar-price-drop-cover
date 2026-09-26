import { CoverTerms as Terms } from "~~/hooks/cover/useCoverTerms";
import { formatTinybars } from "~~/utils/cover/hbar";
import { formatBps } from "~~/utils/cover/price";
import { formatDuration } from "~~/utils/cover/time";

export const CoverTerms = ({ terms }: { terms: Terms }) => (
  <section className="rounded-2xl bg-base-200 p-8 flex flex-col gap-4">
    <h2 className="text-xl font-semibold m-0">How cover works</h2>
    <ol className="list-decimal pl-4 m-0 flex flex-col gap-2 leading-relaxed">
      <li>
        You pick a payout and pay {formatBps(terms.premiumBps)} of it as the premium, plus{" "}
        {formatTinybars(terms.resolutionFee)} HBAR for the scheduled resolution.
      </li>
      <li>
        The strike is {formatBps(terms.triggerDropBps)} below the Chainlink price at purchase. Cover lasts{" "}
        {formatDuration(terms.coverPeriod)}.
      </li>
      <li>You receive a policy NFT. Whoever holds it at expiry receives the payout.</li>
      <li>
        At expiry, the Hedera Schedule Service calls the contract. If the last Chainlink price before expiry is below
        the strike, the contract pays out.
      </li>
      <li>
        If the feed had no update in the {formatDuration(terms.maxPriceAge)} before expiry, the policy is voided and the
        premium is refunded.
      </li>
      <li>
        If nobody can resolve the policy within {formatDuration(terms.unresolvedVoidDelay)} after expiry, anyone can
        void it and refund the premium.
      </li>
    </ol>
  </section>
);
