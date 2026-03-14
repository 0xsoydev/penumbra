import { useEffect, useState } from "react";
import { useEnsName, useEnsText } from "wagmi";
import { normalize } from "viem/ens";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

/**
 * Shape of a single entry in the seller's IPFS reputation manifest.
 * The seller self-reports these; every entry is verified on-chain.
 */
export type ReputationEntry = {
  id: number;
  /** On-chain verified outcome — overrides whatever the manifest claims */
  outcome: "settled" | "cancelled" | "no_bids" | "unverified";
  winningBid: bigint; // 0n if not settled
};

export type SellerReputationData = {
  /** True while ENS text record or IPFS manifest is still fetching */
  isLoading: boolean;
  /** True if the seller has a reputation CID set */
  hasCid: boolean;
  /** Error message if manifest fetch or parse failed */
  error: string | null;
  entries: ReputationEntry[];
  /** Derived stats — computed only from on-chain verified entries */
  stats: {
    total: number;
    settled: number;
    cancelled: number;
    settlementRate: number; // 0–100
    totalVolume: bigint; // sum of winning bids in wei
  };
};

/** Raw shape we expect from the seller's IPFS JSON manifest */
type ManifestEntry = {
  id: unknown;
  chain?: unknown;
};

type Manifest = {
  version?: unknown;
  auctions?: unknown;
};

// ─────────────────────────────────────────────────────────────────────────────
// Internal sub-hook: verifies a single auction ID on-chain and returns a
// ReputationEntry. Returns null while loading.
// ─────────────────────────────────────────────────────────────────────────────
function useVerifiedEntry(auctionId: number | null): ReputationEntry | null {
  const { data: auction, isLoading } = useScaffoldReadContract({
    contractName: "PenumbraAuction",
    functionName: "getAuction",
    args: auctionId !== null ? [BigInt(auctionId)] : undefined,
    query: { enabled: auctionId !== null },
  });

  if (auctionId === null || isLoading || !auction) return null;

  const a = auction as {
    settled?: boolean;
    cancelled?: boolean;
    winner?: string;
    winningBid?: bigint;
  };

  let outcome: ReputationEntry["outcome"];
  if (a.cancelled) outcome = "cancelled";
  else if (a.settled) outcome = "settled";
  else if (!a.winner || a.winner === "0x0000000000000000000000000000000000000000") outcome = "no_bids";
  else outcome = "unverified"; // reveal phase ended but not settled yet

  return {
    id: auctionId,
    outcome,
    winningBid: a.settled ? (a.winningBid ?? 0n) : 0n,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// We support up to MAX_ENTRIES manifest entries to keep hook count stable
// (React rules: hooks must be called unconditionally and in fixed order).
// The seller can list more in the manifest but only the first MAX_ENTRIES
// will be verified on-chain in the UI.
// ─────────────────────────────────────────────────────────────────────────────
const MAX_ENTRIES = 10;

function useVerifiedEntries(ids: (number | null)[]): (ReputationEntry | null)[] {
  // Always call exactly MAX_ENTRIES hooks — pad with null when ids are fewer
  const padded = Array.from({ length: MAX_ENTRIES }, (_, i) => ids[i] ?? null);

  const e0 = useVerifiedEntry(padded[0]);
  const e1 = useVerifiedEntry(padded[1]);
  const e2 = useVerifiedEntry(padded[2]);
  const e3 = useVerifiedEntry(padded[3]);
  const e4 = useVerifiedEntry(padded[4]);
  const e5 = useVerifiedEntry(padded[5]);
  const e6 = useVerifiedEntry(padded[6]);
  const e7 = useVerifiedEntry(padded[7]);
  const e8 = useVerifiedEntry(padded[8]);
  const e9 = useVerifiedEntry(padded[9]);

  return [e0, e1, e2, e3, e4, e5, e6, e7, e8, e9];
}

// ─────────────────────────────────────────────────────────────────────────────
// Main hook
// ─────────────────────────────────────────────────────────────────────────────
export function useSellerReputation(sellerAddress: `0x${string}` | undefined): SellerReputationData {
  const [manifestIds, setManifestIds] = useState<(number | null)[]>([]);
  const [isFetchingManifest, setIsFetchingManifest] = useState(false);
  const [manifestError, setManifestError] = useState<string | null>(null);

  // 1. Resolve ENS name from seller address
  const { data: ensName, isLoading: loadingEns } = useEnsName({
    address: sellerAddress,
    chainId: 1,
    query: { enabled: !!sellerAddress },
  });

  // 2. Read penumbra.reputation text record — seller sets this to an IPFS CID
  const normalized = ensName ? normalize(ensName) : undefined;
  const { data: repCid, isLoading: loadingCid } = useEnsText({
    name: normalized,
    key: "penumbra.reputation",
    chainId: 1,
    query: { enabled: !!normalized },
  });

  // 3. Fetch + parse the manifest from IPFS when CID changes
  useEffect(() => {
    if (!repCid) {
      setManifestIds([]);
      return;
    }

    setIsFetchingManifest(true);
    setManifestError(null);

    const url = `https://w3s.link/ipfs/${repCid}`;
    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`IPFS fetch failed: ${r.statusText}`);
        return r.json() as Promise<Manifest>;
      })
      .then(manifest => {
        if (!Array.isArray(manifest.auctions)) {
          throw new Error("Invalid manifest: auctions must be an array");
        }
        const ids = (manifest.auctions as ManifestEntry[])
          .slice(0, MAX_ENTRIES)
          .map(entry => {
            const id = Number(entry.id);
            return Number.isFinite(id) && id >= 0 ? id : null;
          })
          .filter((id): id is number => id !== null);

        setManifestIds(ids);
        setIsFetchingManifest(false);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Unknown error fetching manifest";
        setManifestError(msg);
        setManifestIds([]);
        setIsFetchingManifest(false);
      });
  }, [repCid]);

  // 4. Verify every manifest entry on-chain (fixed MAX_ENTRIES hooks)
  const rawEntries = useVerifiedEntries(manifestIds);

  // Only entries that match IDs we actually got from the manifest
  const entries: ReputationEntry[] = rawEntries.filter(
    (e): e is ReputationEntry => e !== null && manifestIds.includes(e.id),
  );

  // 5. Compute stats
  const settled = entries.filter(e => e.outcome === "settled").length;
  const cancelled = entries.filter(e => e.outcome === "cancelled").length;
  const total = entries.length;
  const settlementRate = total > 0 ? Math.round((settled / total) * 100) : 0;
  const totalVolume = entries.reduce((sum, e) => sum + e.winningBid, 0n);

  const isLoading = loadingEns || loadingCid || isFetchingManifest;

  return {
    isLoading,
    hasCid: !!repCid,
    error: manifestError,
    entries,
    stats: { total, settled, cancelled, settlementRate, totalVolume },
  };
}
