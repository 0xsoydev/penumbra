import { useState, useEffect } from "react";
import { keccak256, encodePacked } from "viem";
import { useAccount } from "wagmi";
import type { BidCommitData } from "~~/types/auction";

function storageKey(auctionId: number, address: string) {
  return `dark-auction-salt:${auctionId}:${address.toLowerCase()}`;
}

export function useBidCommit(auctionId: number): BidCommitData {
  const { address } = useAccount();
  const [salt, setSalt] = useState<`0x${string}` | null>(null);
  const [commitHash, setCommitHash] = useState<`0x${string}` | null>(null);

  // Load saved salt on mount
  useEffect(() => {
    if (!address) return;
    const saved = localStorage.getItem(storageKey(auctionId, address));
    if (saved) setSalt(saved as `0x${string}`);
  }, [auctionId, address]);

  const generateCommit = (amount: bigint) => {
    if (!address) throw new Error("No wallet connected");

    const randomBytes = crypto.getRandomValues(new Uint8Array(32));
    const newSalt = ("0x" +
      Array.from(randomBytes)
        .map(b => b.toString(16).padStart(2, "0"))
        .join("")) as `0x${string}`;

    const hash = keccak256(encodePacked(["uint256", "bytes32"], [amount, newSalt]));

    localStorage.setItem(storageKey(auctionId, address), newSalt);
    setSalt(newSalt);
    setCommitHash(hash);
  };

  const clearSalt = () => {
    if (!address) return;
    localStorage.removeItem(storageKey(auctionId, address));
    setSalt(null);
    setCommitHash(null);
  };

  return { commitHash, generateCommit, salt, clearSalt };
}
