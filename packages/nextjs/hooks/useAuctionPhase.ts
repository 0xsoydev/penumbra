"use client";

import { useEffect, useState } from "react";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { AuctionPhase, type AuctionPhaseData } from "~~/types/auction";

export function useAuctionPhase(auctionId: number): AuctionPhaseData {
  const [timeRemaining, setTimeRemaining] = useState(0);

  const { data: auction } = useScaffoldReadContract({
    contractName: "PenumbraAuction",
    functionName: "getAuction",
    args: [BigInt(auctionId)],
  });

  const { data: phaseRaw } = useScaffoldReadContract({
    contractName: "PenumbraAuction",
    functionName: "getAuctionPhase",
    args: [BigInt(auctionId)],
  });

  useEffect(() => {
    if (!auction) return;

    const now = Math.floor(Date.now() / 1000);
    const phase = Number(phaseRaw ?? 0);

    let deadline = 0;
    if (phase === AuctionPhase.COMMIT) deadline = Number((auction as { commitDeadline: bigint }).commitDeadline);
    else if (phase === AuctionPhase.REVEAL) deadline = Number((auction as { revealDeadline: bigint }).revealDeadline);

    const remaining = Math.max(0, deadline - now);
    setTimeRemaining(remaining);

    if (remaining === 0) return;
    const interval = setInterval(() => {
      setTimeRemaining(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [auction, phaseRaw]);

  return {
    phase: Number(phaseRaw ?? 0) as AuctionPhase,
    timeRemaining,
  };
}
