"use client";

import { useState, useEffect } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { keccak256, toHex } from "viem";
import type { StealthKeys } from "~~/types/auction";

function deriveKeyPairFromSignature(sig: string): { spendingPubKey: string; viewingPubKey: string } {
  const spendingSeed = keccak256(toHex(`dark-auction-spending:${sig}`));
  const viewingSeed = keccak256(toHex(`dark-auction-viewing:${sig}`));
  return { spendingPubKey: spendingSeed, viewingPubKey: viewingSeed };
}

export function useStealthKeys(): StealthKeys {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [spendingPubKey, setSpendingPubKey] = useState<string>("");
  const [viewingPubKey, setViewingPubKey] = useState<string>("");
  const [isRegistered, setIsRegistered] = useState(false);

  useEffect(() => {
    if (!address) return;
    const stored = localStorage.getItem(`stealth-keys:${address}`);
    if (stored) {
      const { spendingPubKey: s, viewingPubKey: v } = JSON.parse(stored);
      setSpendingPubKey(s);
      setViewingPubKey(v);
      setIsRegistered(true);
    }
  }, [address]);

  const register = async () => {
    if (!address) throw new Error("No wallet connected");

    const sig = await signMessageAsync({
      message: `DarkAuction stealth key registration\nAddress: ${address}\nThis signature generates your privacy keys.`,
    });

    const { spendingPubKey: s, viewingPubKey: v } = deriveKeyPairFromSignature(sig);

    await fetch("/api/stealth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, spendingPublicKey: s, viewingPublicKey: v }),
    });

    localStorage.setItem(`stealth-keys:${address}`, JSON.stringify({ spendingPubKey: s, viewingPubKey: v }));
    setSpendingPubKey(s);
    setViewingPubKey(v);
    setIsRegistered(true);
  };

  return { spendingPubKey, viewingPubKey, isRegistered, register };
}
