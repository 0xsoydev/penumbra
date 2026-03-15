"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AuctionListItem } from "./AuctionListItem";
import { useAccount } from "wagmi";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { AuctionData, AuctionPhase } from "~~/types/auction";

type AuctionEntry = {
  id: number;
  auction: AuctionData;
  phase: AuctionPhase;
  bidderCount: number;
};

export const AuctionList = () => {
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
    <>
      {/* Filters */}
      <div id="auctions" className="w-full px-6 md:px-12 lg:px-24 mt-16 relative z-20">
        <div className="flex items-center justify-between flex-wrap gap-3 max-w-7xl mx-auto">
          <div className="flex gap-2">
            {(["all", "active", "ended", "mine"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`btn btn-sm font-bold capitalize rounded-none border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-[1px_1px_0px_rgba(0,0,0,1)] transition-all ${filter === f ? "bg-black text-white" : "bg-[#E5E5E5] text-black"}`}
              >
                {f === "mine" ? "My Auctions" : f}
              </button>
            ))}
          </div>
          <p className="text-sm font-bold text-black border-2 border-black px-4 py-1 bg-[#E5E5E5] shadow-[2px_2px_0px_rgba(0,0,0,1)]">
            {nextAuctionId !== undefined ? `${Number(nextAuctionId)} total auctions` : "Loading..."}
          </p>
        </div>
      </div>

      {/* Auction grid */}
      <div className="w-full px-6 md:px-12 lg:px-24 py-8 flex-1 relative z-20">
        <div className="max-w-7xl mx-auto">
          {loading ? (
            <div className="flex justify-center py-20">
              <span className="loading loading-spinner loading-lg text-[#0066FF]" />
            </div>
          ) : auctions.length === 0 ? (
            <div className="text-center py-20 border-4 border-black bg-[#E5E5E5] shadow-[8px_8px_0px_#0066FF] max-w-2xl mx-auto">
              <div className="text-6xl mb-4 text-black opacity-50 font-black">0</div>
              <h3 className="text-2xl font-black text-black mb-2">No auctions yet</h3>
              <p className="text-base text-black font-medium mb-8">Be the first to create a sealed-bid auction.</p>
              <Link
                href="/auction/create"
                className="btn bg-[#0066FF] text-black border-2 border-black hover:bg-[#0055DD] rounded-none px-8 text-lg font-bold shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[2px_2px_0px_rgba(0,0,0,1)] transition-all"
              >
                Create Auction
              </Link>
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
    </>
  );
};
