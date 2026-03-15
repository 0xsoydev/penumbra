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

  const { data: commitCount } = useScaffoldReadContract({
    contractName: "PenumbraAuction",
    functionName: "getCommitCount",
    args: [BigInt(auctionId)],
  });

  if (!auctionData || phase === undefined) {
    return (
      <div className="bg-white border-4 border-black shadow-[8px_8px_0px_#0066FF] animate-pulse rounded-none">
        <div className="p-6">
          <div className="h-8 bg-[#E5E5E5] border-2 border-black w-1/3 mb-4" />
          <div className="h-6 bg-[#E5E5E5] border-2 border-black w-2/3 mb-4" />
          <div className="h-24 bg-[#E5E5E5] border-2 border-black mb-4" />
          <div className="h-6 bg-[#E5E5E5] border-2 border-black w-1/2" />
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
