"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { AuctionCard } from "~~/components/penumbra/AuctionCard";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { AuctionData, AuctionPhase } from "~~/types/auction";

type AuctionEntry = {
  id: number;
  auction: AuctionData;
  phase: AuctionPhase;
  bidderCount: number;
};

const AuctionsPage: NextPage = () => {
  const { address } = useAccount();
  const [auctions, setAuctions] = useState<AuctionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "ended" | "mine">("all");

  const { data: nextAuctionId } = useScaffoldReadContract({
    contractName: "PenumbraAuction",
    functionName: "nextAuctionId",
  });

  // Fetch all auctions when nextAuctionId is available
  useEffect(() => {
    if (nextAuctionId === undefined) return;

    const totalAuctions = Number(nextAuctionId);
    if (totalAuctions === 0) {
      setAuctions([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // We'll build auction entries as they load
    const entries: AuctionEntry[] = [];
    let loaded = 0;

    // Use a sequential approach for reliability
    const loadAuction = async (id: number) => {
      try {
        // We can't call hooks in a loop, so we'll set up the data structure
        // and let individual AuctionListItem components handle their own data fetching
        entries.push({
          id,
          auction: {} as AuctionData,
          phase: AuctionPhase.COMMIT,
          bidderCount: 0,
        });
      } finally {
        loaded++;
        if (loaded === totalAuctions) {
          setAuctions([...entries]);
          setLoading(false);
        }
      }
    };

    for (let i = 0; i < totalAuctions; i++) {
      loadAuction(i);
    }
  }, [nextAuctionId]);

  return (
    <div className="flex-1 py-12 px-4 sm:px-6 bg-[#E5E5E5] min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-12">
          <h1 className="font-winky text-4xl md:text-5xl font-normal tracking-wide text-black uppercase">
            Browse Auctions
          </h1>
          <Link
            href="/auction/create"
            className="btn bg-[#0066FF] text-white border-4 border-black hover:bg-[#0055DD] rounded-none px-8 py-3 h-auto text-lg font-dm font-bold uppercase tracking-wider shadow-[6px_6px_0px_#000000] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[4px_4px_0px_#000000] transition-all"
          >
            Create Auction
          </Link>
        </div>

        {/* Filters */}
        <div className="mb-8 bg-white border-4 border-black p-4 shadow-[4px_4px_0px_#0066FF] flex items-center justify-between flex-wrap gap-4">
          <div className="flex flex-wrap gap-2">
            {(["all", "active", "ended", "mine"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 font-fira font-bold uppercase tracking-wider text-sm border-2 border-black transition-all ${
                  filter === f
                    ? "bg-black text-white shadow-[2px_2px_0px_#0066FF] translate-y-[2px] translate-x-[2px]"
                    : "bg-[#E5E5E5] text-black shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[2px_2px_0px_rgba(0,0,0,1)]"
                }`}
              >
                {f === "mine" ? "My Auctions" : f}
              </button>
            ))}
          </div>
          <p className="font-fira text-sm font-bold uppercase tracking-wider text-black bg-[#E5E5E5] border-2 border-black px-4 py-2 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
            {nextAuctionId !== undefined ? `${Number(nextAuctionId)} total auctions` : "Loading..."}
          </p>
        </div>

        {/* Auction grid */}
        {loading ? (
          <div className="flex justify-center items-center py-20 min-h-[400px] bg-white border-4 border-black shadow-[8px_8px_0px_#0066FF]">
            <span className="loading loading-spinner loading-lg text-black" />
          </div>
        ) : auctions.length === 0 ? (
          <div className="text-center py-20 border-4 border-black bg-white shadow-[8px_8px_0px_#0066FF] w-full flex flex-col items-center justify-center min-h-[400px]">
            <div className="text-6xl mb-6 text-black opacity-20 font-black">0</div>
            <h3 className="text-2xl font-winky font-normal tracking-wide uppercase text-black mb-4">
              No auctions found
            </h3>
            <p className="font-dm text-base text-black/70 font-bold mb-8 max-w-md mx-auto">
              {filter === "all"
                ? "Be the first to create a privacy-preserving sealed-bid auction."
                : `No auctions match the "${filter === "mine" ? "My Auctions" : filter}" filter.`}
            </p>
            {filter === "all" && (
              <Link
                href="/auction/create"
                className="btn bg-[#0066FF] text-white border-4 border-black hover:bg-[#0055DD] rounded-none px-8 py-3 h-auto text-lg font-dm font-bold uppercase tracking-wider shadow-[6px_6px_0px_#000000] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[4px_4px_0px_#000000] transition-all"
              >
                Create First Auction
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {auctions.map(entry => (
              <AuctionListItem key={entry.id} auctionId={entry.id} filter={filter} userAddress={address} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Individual auction item that fetches its own data via hooks
const AuctionListItem = ({
  auctionId,
  filter,
  userAddress,
}: {
  auctionId: number;
  filter: "all" | "active" | "ended" | "mine";
  userAddress: string | undefined;
}) => {
  const { data: auctionData } = useScaffoldReadContract({
    contractName: "PenumbraAuction",
    functionName: "getAuction",
    args: [BigInt(auctionId)],
  });

  const { data: phase } = useScaffoldReadContract({
    contractName: "PenumbraAuction",
    functionName: "getAuctionPhase",
    args: [BigInt(auctionId)],
  });

  const { data: commitCount } = useScaffoldReadContract({
    contractName: "PenumbraAuction",
    functionName: "getCommitCount",
    args: [BigInt(auctionId)],
  });

  if (!auctionData || phase === undefined) {
    return (
      <div className="card bg-white border-4 border-black shadow-[8px_8px_0px_rgba(0,0,0,1)] animate-pulse rounded-none">
        <div className="card-body p-6">
          <div className="h-8 bg-[#E5E5E5] border-2 border-black rounded-none w-1/3 mb-4" />
          <div className="h-6 bg-[#E5E5E5] border-2 border-black rounded-none w-2/3 mb-4" />
          <div className="h-24 bg-[#E5E5E5] border-2 border-black rounded-none mb-4" />
          <div className="h-6 bg-[#E5E5E5] border-2 border-black rounded-none w-1/2" />
        </div>
      </div>
    );
  }

  const d = auctionData as unknown as {
    seller: string;
    tokenAddress: string;
    tokenAmount: bigint;
    minimumBid: bigint;
    commitDeadline: bigint;
    settleDeadline: bigint;
    winningNullifier: string;
    claimed: boolean;
    cancelled: boolean;
  };

  const auction: AuctionData = {
    seller: d.seller,
    tokenAddress: d.tokenAddress,
    tokenAmount: d.tokenAmount,
    minimumBid: d.minimumBid,
    commitDeadline: d.commitDeadline,
    settleDeadline: d.settleDeadline,
    winningNullifier: d.winningNullifier,
    claimed: d.claimed,
    cancelled: d.cancelled,
  };

  const currentPhase = phase as AuctionPhase;
  const bidderCount = commitCount ? Number(commitCount) : 0;

  // Apply filters
  if (filter === "active" && currentPhase !== AuctionPhase.COMMIT && currentPhase !== AuctionPhase.SETTLE) return null;
  if (filter === "ended" && currentPhase !== AuctionPhase.ENDED && currentPhase !== AuctionPhase.CANCELLED) return null;
  if (filter === "mine" && userAddress && auction.seller.toLowerCase() !== userAddress.toLowerCase()) return null;

  return <AuctionCard auctionId={auctionId} auction={auction} phase={currentPhase} bidderCount={bidderCount} />;
};

export default AuctionsPage;
