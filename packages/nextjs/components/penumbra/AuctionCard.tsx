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
        className={`bg-white border-4 border-black shadow-[8px_8px_0px_#0066FF] hover:shadow-[12px_12px_0px_#0066FF] hover:-translate-y-1 transition-all duration-200 cursor-pointer rounded-none text-black flex flex-col h-full ${
          !isActive ? "opacity-90" : ""
        }`}
      >
        <div className="p-6 flex flex-col flex-1">
          {/* Header */}
          <div className="flex items-center justify-between mb-4 border-b-4 border-black pb-4">
            <h3 className="text-2xl font-black tracking-wide uppercase">Auction #{auctionId}</h3>
            <PhaseIndicator phase={phase} size="sm" />
          </div>

          {/* Seller */}
          <div className="flex items-center gap-2 text-sm uppercase font-black bg-[#E5E5E5] border-2 border-black p-2 shadow-[2px_2px_0px_#000000] w-fit">
            <span>SELLER:</span>
            <Address address={auction.seller} size="xs" disableAddressLink />
          </div>

          {/* Token info */}
          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="bg-[#E5E5E5] border-2 border-black shadow-[4px_4px_0px_#000000] p-3 text-center">
              <p className="text-[10px] font-black uppercase tracking-wider mb-1">TOKEN AMOUNT</p>
              <p className="font-mono font-black text-base bg-white border border-black p-1">
                {formatEther(auction.tokenAmount)}
              </p>
            </div>
            <div className="bg-[#E5E5E5] border-2 border-black shadow-[4px_4px_0px_#000000] p-3 text-center">
              <p className="text-[10px] font-black uppercase tracking-wider mb-1">MIN BID</p>
              <p className="font-mono font-black text-base bg-white border border-black p-1">
                {formatEther(auction.minimumBid)} ETH
              </p>
            </div>
          </div>

          <div className="flex-1" />

          {/* Stats row */}
          <div className="flex items-center justify-between mt-8 pt-4 border-t-4 border-black uppercase font-black bg-[#FFD700] border-2 border-black p-3 shadow-[4px_4px_0px_#000]">
            <div className="flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path d="M10 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.465 14.493a1.23 1.23 0 0 0 .41 1.412A9.957 9.957 0 0 0 10 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 0 0-13.074.003Z" />
              </svg>
              <span className="text-sm">
                {bidderCount} BID{bidderCount !== 1 ? "S" : ""}
              </span>
            </div>

            {isActive && (
              <CountdownTimer
                deadline={deadline}
                label={phase === AuctionPhase.COMMIT ? "COMMIT ENDS" : "SETTLE ENDS"}
              />
            )}

            {phase === AuctionPhase.ENDED && auction.winningNullifier !== ZERO_BYTES32 && (
              <div className="text-right bg-white p-1 border border-black">
                <p className="text-[10px] font-black uppercase tracking-wider">WINNER</p>
                <p className="font-mono font-black text-xs text-black truncate max-w-[100px]">
                  {auction.winningNullifier.slice(0, 10)}...
                </p>
              </div>
            )}

            {phase === AuctionPhase.CANCELLED && (
              <span className="text-sm text-[#E60000] bg-white p-1 border border-black">CANCELLED</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
};
