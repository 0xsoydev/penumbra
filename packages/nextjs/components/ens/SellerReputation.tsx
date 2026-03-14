"use client";

import { useSellerReputation } from "~~/hooks/useSellerReputation";

type Props = {
  sellerAddress: `0x${string}`;
};

/**
 * SellerReputation
 *
 * Reads the seller's `penumbra.reputation` ENS text record (an IPFS CID),
 * fetches their self-reported auction history manifest from IPFS, then
 * independently verifies every entry against on-chain PenumbraAuction state.
 *
 * The seller cannot lie: if they claim auction #3 was "settled" but the
 * contract says it was cancelled, we show the contract's truth.
 *
 * Renders a compact stats bar + per-auction history table.
 * Renders nothing (null) if the seller has no reputation CID set — fully
 * optional, so existing auction pages are unaffected.
 */
export function SellerReputation({ sellerAddress }: Props) {
  const { isLoading, hasCid, error, entries, stats } = useSellerReputation(sellerAddress);

  // Seller hasn't published a reputation manifest — render nothing
  if (!isLoading && !hasCid) return null;

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="mt-3 animate-pulse">
        <div className="h-3 w-24 bg-base-300 rounded mb-2" />
        <div className="flex gap-2">
          <div className="h-8 w-16 bg-base-300 rounded" />
          <div className="h-8 w-16 bg-base-300 rounded" />
          <div className="h-8 w-16 bg-base-300 rounded" />
        </div>
      </div>
    );
  }

  // ── IPFS fetch / parse error ───────────────────────────────────────────────
  if (error) {
    return (
      <div className="mt-3 alert alert-warning py-2 px-3 text-xs">
        <span>Reputation manifest unavailable: {error}</span>
      </div>
    );
  }

  // ── No verified entries yet (manifest fetched but auctions still resolving) ─
  if (entries.length === 0) {
    return (
      <div className="mt-3 text-xs text-base-content/40 italic">
        Verifying auction history…
      </div>
    );
  }

  // ── Full reputation card ───────────────────────────────────────────────────
  return (
    <div className="mt-3 flex flex-col gap-3">
      {/* Label */}
      <div className="flex items-center gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-base-content/50">
          Verified Reputation
        </span>
        <span
          className="badge badge-xs badge-outline"
          title="Every entry is verified against on-chain PenumbraAuction state"
        >
          on-chain
        </span>
      </div>

      {/* Stats bar */}
      <div className="flex flex-wrap gap-2">
        <div className="stat bg-base-200 rounded-lg py-2 px-3 min-w-0">
          <div className="stat-title text-xs">Auctions</div>
          <div className="stat-value text-lg">{stats.total}</div>
        </div>

        <div className="stat bg-base-200 rounded-lg py-2 px-3 min-w-0">
          <div className="stat-title text-xs">Settlement rate</div>
          <div
            className={`stat-value text-lg ${
              stats.settlementRate >= 80
                ? "text-success"
                : stats.settlementRate >= 50
                  ? "text-warning"
                  : "text-error"
            }`}
          >
            {stats.settlementRate}%
          </div>
        </div>

        {stats.totalVolume > 0n && (
          <div className="stat bg-base-200 rounded-lg py-2 px-3 min-w-0">
            <div className="stat-title text-xs">Total volume</div>
            <div className="stat-value text-lg">
              {/* Show in ETH with 4 decimal places */}
              {(Number(stats.totalVolume) / 1e18).toFixed(4)}
              <span className="text-sm font-normal ml-1">ETH</span>
            </div>
          </div>
        )}
      </div>

      {/* Per-auction history */}
      <div className="overflow-x-auto">
        <table className="table table-xs w-full">
          <thead>
            <tr>
              <th>Auction</th>
              <th>Outcome</th>
              <th>Winning bid</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(entry => (
              <tr key={entry.id}>
                <td className="font-mono">#{entry.id}</td>
                <td>
                  <OutcomeBadge outcome={entry.outcome} />
                </td>
                <td className="font-mono text-xs">
                  {entry.outcome === "settled" && entry.winningBid > 0n
                    ? `${(Number(entry.winningBid) / 1e18).toFixed(4)} ETH`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Small helper — outcome badge ───────────────────────────────────────────
function OutcomeBadge({ outcome }: { outcome: string }) {
  switch (outcome) {
    case "settled":
      return <span className="badge badge-success badge-sm">settled</span>;
    case "cancelled":
      return <span className="badge badge-error badge-sm">cancelled</span>;
    case "no_bids":
      return <span className="badge badge-ghost badge-sm">no bids</span>;
    default:
      return <span className="badge badge-warning badge-sm">unverified</span>;
  }
}
