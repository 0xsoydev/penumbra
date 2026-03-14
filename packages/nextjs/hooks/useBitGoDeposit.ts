import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import type { BitGoDepositData } from "~~/types/auction";

export function useBitGoDeposit(auctionId: number): BitGoDepositData {
  const { address } = useAccount();
  const [depositAddress, setDepositAddress] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [amount, setAmount] = useState("0");

  // Create or fetch deposit address on mount
  useEffect(() => {
    if (!address) return;

    fetch(`/api/auction/${auctionId}/deposit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bidderAddress: address }),
    })
      .then(r => r.json())
      .then(data => setDepositAddress(data.depositAddress))
      .catch(err => console.error("Failed to get deposit address:", err));
  }, [auctionId, address]);

  // Poll for BitGo confirmation every 15 seconds
  useEffect(() => {
    if (!address || !depositAddress) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/auction/${auctionId}/status?bidder=${address}`);
        const data = await res.json();
        setConfirmed(data.confirmed ?? false);
        setAmount(data.amountWei ?? "0");
      } catch (err) {
        console.error("Failed to poll deposit status:", err);
      }
    };

    poll();
    const interval = setInterval(poll, 15_000);
    return () => clearInterval(interval);
  }, [auctionId, address, depositAddress]);

  return { depositAddress, confirmed, amount };
}
