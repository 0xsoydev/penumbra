"use client";

import Link from "next/link";
import { CountdownTimer } from "./CountdownTimer";
import { PhaseIndicator } from "./PhaseIndicator";
import { Address } from "@scaffold-ui/components";
import { formatEther } from "viem";
import { AuctionData, AuctionPhase } from "~~/types/auction";

const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

type AuctionCardProps = {
  auctionId: number;
  auction: AuctionData;
  phase: AuctionPhase;
  bidderCount: number;
};

export const AuctionCard = ({ auctionId, auction, phase, bidderCount }: AuctionCardProps) => {
  const isActive = phase === AuctionPhase.COMMIT || phase === AuctionPhase.SETTLE;
  const deadline = phase === AuctionPhase.COMMIT ? auction.commitDeadline : auction.settleDeadline;

  return (
    <Link href={`/auction/${auctionId}`}>
      <div
        className={`card bg-base-100 shadow-xl border border-base-300 hover:shadow-2xl hover:-translate-y-1 transition-all duration-200 cursor-pointer ${
          !isActive ? "opacity-75" : ""
        }`}
      >
        <div className="card-body p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <h3 className="card-title text-lg font-black tracking-wide">Auction #{auctionId}</h3>
            <PhaseIndicator phase={phase} size="sm" />
          </div>

          {/* Seller */}
          <div className="flex items-center gap-2 text-sm opacity-70">
            <span className="font-semibold">Seller:</span>
            <Address address={auction.seller} size="xs" disableAddressLink />
          </div>

          {/* Token info */}
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="bg-base-200 rounded-lg p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider opacity-50">Token Amount</p>
              <p className="font-mono font-bold text-sm">{formatEther(auction.tokenAmount)} PNBR</p>
            </div>
            <div className="bg-base-200 rounded-lg p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider opacity-50">Min Bid</p>
              <p className="font-mono font-bold text-sm">{formatEther(auction.minimumBid)} ETH</p>
            </div>
          </div>

          {/* Stats row */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-base-300">
            <div className="flex items-center gap-1.5">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4 opacity-50"
              >
                <path d="M10 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.465 14.493a1.23 1.23 0 0 0 .41 1.412A9.957 9.957 0 0 0 10 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 0 0-13.074.003Z" />
              </svg>
              <span className="text-sm font-semibold">
                {bidderCount} bid{bidderCount !== 1 ? "s" : ""}
              </span>
            </div>

            {isActive && (
              <CountdownTimer
                deadline={deadline}
                label={phase === AuctionPhase.COMMIT ? "Commit ends" : "Settle ends"}
              />
            )}

            {phase === AuctionPhase.ENDED && auction.winningNullifier !== ZERO_BYTES32 && (
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-wider opacity-50">Winner</p>
                <p className="font-mono font-bold text-xs text-success">{auction.winningNullifier.slice(0, 10)}...</p>
              </div>
            )}

            {phase === AuctionPhase.CANCELLED && <span className="text-sm font-semibold text-error">Cancelled</span>}
          </div>
        </div>
      </div>
    </Link>
  );
};
