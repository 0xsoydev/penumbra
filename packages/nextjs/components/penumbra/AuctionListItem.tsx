"use client";

import { AuctionCard } from "~~/components/penumbra/AuctionCard";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { AuctionData, AuctionPhase } from "~~/types/auction";

export const AuctionListItem = ({
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

  const { data: bidders } = useScaffoldReadContract({
    contractName: "PenumbraAuction",
    functionName: "getAuctionBidders",
    args: [BigInt(auctionId)],
  });

  if (!auctionData || phase === undefined) {
    return (
      <div className="card bg-base-100 shadow-xl border border-base-300 animate-pulse">
        <div className="card-body p-6">
          <div className="h-6 bg-base-300 rounded w-1/3 mb-3" />
          <div className="h-4 bg-base-300 rounded w-2/3 mb-2" />
          <div className="h-20 bg-base-300 rounded mb-2" />
          <div className="h-4 bg-base-300 rounded w-1/2" />
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
    revealDeadline: bigint;
    winner: string;
    winningBid: bigint;
    winnerStealthAddress: string;
    settled: boolean;
    cancelled: boolean;
  };

  const auction: AuctionData = {
    seller: d.seller,
    tokenAddress: d.tokenAddress,
    tokenAmount: d.tokenAmount,
    minimumBid: d.minimumBid,
    commitDeadline: d.commitDeadline,
    revealDeadline: d.revealDeadline,
    winner: d.winner,
    winningBid: d.winningBid,
    winnerStealthAddress: d.winnerStealthAddress,
    settled: d.settled,
    cancelled: d.cancelled,
  };

  const currentPhase = phase as AuctionPhase;
  const bidderCount = bidders ? (bidders as readonly string[]).length : 0;

  // Apply filters
  if (filter === "active" && currentPhase !== AuctionPhase.COMMIT && currentPhase !== AuctionPhase.REVEAL) return null;
  if (filter === "ended" && currentPhase !== AuctionPhase.ENDED && currentPhase !== AuctionPhase.CANCELLED) return null;
  if (filter === "mine" && userAddress && auction.seller.toLowerCase() !== userAddress.toLowerCase()) return null;

  return <AuctionCard auctionId={auctionId} auction={auction} phase={currentPhase} bidderCount={bidderCount} />;
};
