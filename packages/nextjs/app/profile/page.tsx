"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Address } from "@scaffold-ui/components";
import type { NextPage } from "next";
import { keccak256, toBytes } from "viem";
import { useAccount, useSignMessage } from "wagmi";
import { useBidStorage } from "~~/hooks/penumbra/useBidStorage";
import { StealthAnnouncement, StoredBid } from "~~/types/auction";
import { notification } from "~~/utils/scaffold-eth";

// Derive a private key from a deterministic signature
const deriveKeyFromSignature = (signature: string, purpose: string): string => {
  return keccak256(toBytes(`${purpose}:${signature}`));
};

// Derive uncompressed public key from private key (placeholder - actual EC math needs a library)
// In production, this would use secp256k1 point multiplication
const getPublicKeyFromPrivate = async (privateKey: string): Promise<string> => {
  // For the hackathon, we use a simplified approach:
  // The actual umbra-js library handles this server-side
  // Here we generate a deterministic "public key" that's 132 chars with 0x04 prefix
  const hash1 = keccak256(toBytes(privateKey + ":x"));
  const hash2 = keccak256(toBytes(privateKey + ":y"));
  // Uncompressed public key format: 0x04 + 64 bytes (x) + 64 bytes (y)
  return "0x04" + hash1.slice(2) + hash2.slice(2);
};

const Profile: NextPage = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { getAllBids } = useBidStorage();

  const [stealthRegistered, setStealthRegistered] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [announcements, setAnnouncements] = useState<StealthAnnouncement[]>([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);
  const [savedBids, setSavedBids] = useState<StoredBid[]>([]);
  const [spendingPubKey, setSpendingPubKey] = useState<string | null>(null);
  const [viewingPubKey, setViewingPubKey] = useState<string | null>(null);

  // Load saved bids from localStorage
  useEffect(() => {
    setSavedBids(getAllBids());
  }, [getAllBids]);

  // Fetch stealth announcements
  const fetchAnnouncements = useCallback(async () => {
    if (!address) return;
    setAnnouncementsLoading(true);
    try {
      const res = await fetch(`/api/stealth/announcements?address=${address.toLowerCase()}`);
      if (res.ok) {
        const data = await res.json();
        setAnnouncements(data.announcements || []);
      }
    } catch (e) {
      console.error("Failed to fetch announcements:", e);
    } finally {
      setAnnouncementsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (address) {
      fetchAnnouncements();
    }
  }, [address, fetchAnnouncements]);

  // Register stealth keys
  const handleRegisterStealthKeys = async () => {
    if (!address) return;
    setRegistering(true);

    try {
      // Step 1: Sign a message to derive spending key
      notification.info("Sign the message to derive your spending key...");
      const spendingSig = await signMessageAsync({
        message: `dark-auction-spending:${address}`,
      });

      // Step 2: Sign a message to derive viewing key
      notification.info("Sign the message to derive your viewing key...");
      const viewingSig = await signMessageAsync({
        message: `dark-auction-viewing:${address}`,
      });

      // Step 3: Derive private keys
      const spendingPrivKey = deriveKeyFromSignature(spendingSig, "dark-auction-spending");
      const viewingPrivKey = deriveKeyFromSignature(viewingSig, "dark-auction-viewing");

      // Step 4: Derive public keys
      const spendingPublicKey = await getPublicKeyFromPrivate(spendingPrivKey);
      const viewingPublicKey = await getPublicKeyFromPrivate(viewingPrivKey);

      // Step 5: Register with backend
      const res = await fetch("/api/stealth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: address.toLowerCase(),
          spendingPublicKey,
          viewingPublicKey,
        }),
      });

      if (res.ok) {
        setStealthRegistered(true);
        setSpendingPubKey(spendingPublicKey);
        setViewingPubKey(viewingPublicKey);
        notification.success("Stealth keys registered successfully!");
      } else {
        const err = await res.json();
        notification.error(err.error || "Failed to register stealth keys");
      }
    } catch (e: unknown) {
      console.error("Stealth key registration error:", e);
      if ((e as { code?: number })?.code === 4001) {
        notification.error("Signature rejected by user");
      } else {
        notification.error("Failed to register stealth keys");
      }
    } finally {
      setRegistering(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 py-20 px-4 bg-[#E5E5E5] min-h-screen">
        <div className="bg-white border-4 border-black shadow-[8px_8px_0px_#0066FF] p-12 flex flex-col items-center max-w-md text-center relative">
          {/* Decorative corner accent */}
          <div className="absolute -top-4 -right-4 w-8 h-8 bg-[#E60000] border-2 border-black shadow-[2px_2px_0px_#000] z-10 transform rotate-12"></div>

          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="w-24 h-24 text-black mb-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
            />
          </svg>
          <h2 className="text-3xl font-black mb-4 text-black uppercase">Connect Wallet</h2>
          <p className="text-base font-bold text-black border-2 border-black px-4 py-2 bg-[#E5E5E5] shadow-[2px_2px_0px_#000]">
            Connect a wallet to view your profile and manage stealth keys.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 py-12 px-4 sm:px-6 bg-[#E5E5E5] min-h-screen">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-5xl md:text-6xl font-black tracking-tight mb-2 text-black uppercase">Dashboard</h1>
            <p className="text-lg font-bold text-black bg-white border-2 border-black px-6 py-2 inline-block shadow-[4px_4px_0px_#0066FF]">
              Manage your stealth keys and bids.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm font-bold bg-white border-4 border-black px-4 py-2 shadow-[4px_4px_0px_#000]">
            <span className="uppercase tracking-wider">Connected:</span>
            <Address address={address} size="sm" />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* ===== STEALTH KEYS ===== */}
          <div className="bg-white border-4 border-black shadow-[8px_8px_0px_#0066FF] relative flex flex-col">
            <div className="absolute top-0 right-0 w-16 h-16 bg-[#0066FF] opacity-10 rounded-bl-full"></div>
            <div className="p-6 md:p-8 flex-1 flex flex-col">
              <h2 className="text-2xl font-black uppercase flex items-center gap-3 mb-4 text-black border-b-4 border-black pb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={3}
                  stroke="currentColor"
                  className="w-8 h-8 text-[#0066FF]"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z"
                  />
                </svg>
                Stealth Keys
              </h2>

              <p className="text-sm font-bold text-black/70 mb-6">
                Stealth keys enable private payments. Register them once to receive auction winnings and payments at
                stealth addresses that cannot be linked to your wallet.
              </p>

              <div className="mt-auto">
                {stealthRegistered ? (
                  <div className="space-y-4">
                    <div className="bg-[#0066FF] text-white border-4 border-black p-4 shadow-[4px_4px_0px_#000] flex items-center gap-3">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={3}
                        stroke="currentColor"
                        className="w-6 h-6"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                      <span className="text-lg font-black uppercase tracking-wider">Keys Registered!</span>
                    </div>

                    {spendingPubKey && (
                      <div className="bg-[#E5E5E5] border-2 border-black p-4 shadow-[2px_2px_0px_#000]">
                        <p className="text-xs font-black uppercase tracking-wider text-black mb-2">
                          Spending Public Key
                        </p>
                        <p className="font-mono text-xs break-all text-black/80 font-bold bg-white p-2 border border-black">
                          {spendingPubKey.slice(0, 20)}...{spendingPubKey.slice(-16)}
                        </p>
                      </div>
                    )}
                    {viewingPubKey && (
                      <div className="bg-[#E5E5E5] border-2 border-black p-4 shadow-[2px_2px_0px_#000]">
                        <p className="text-xs font-black uppercase tracking-wider text-black mb-2">
                          Viewing Public Key
                        </p>
                        <p className="font-mono text-xs break-all text-black/80 font-bold bg-white p-2 border border-black">
                          {viewingPubKey.slice(0, 20)}...{viewingPubKey.slice(-16)}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <button
                      onClick={handleRegisterStealthKeys}
                      disabled={registering}
                      className="w-full py-4 bg-[#0066FF] text-white border-4 border-black font-black text-xl uppercase tracking-wider shadow-[6px_6px_0px_#000000] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[4px_4px_0px_#000000] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {registering ? (
                        <span className="flex items-center justify-center gap-3">
                          <span className="loading loading-spinner loading-md" />
                          Signing...
                        </span>
                      ) : (
                        "Register Stealth Keys"
                      )}
                    </button>
                    <div className="mt-4 bg-[#FFD700] border-2 border-black p-3 shadow-[2px_2px_0px_#000]">
                      <p className="text-xs font-bold text-black">
                        You will be asked to sign two messages. These signatures are used to derive your stealth key
                        pair deterministically. No private keys leave your device.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ===== SAVED BIDS ===== */}
          <div className="bg-white border-4 border-black shadow-[8px_8px_0px_#0066FF] relative flex flex-col">
            <div className="p-6 md:p-8 flex-1 flex flex-col">
              <h2 className="text-2xl font-black uppercase flex items-center gap-3 mb-4 text-black border-b-4 border-black pb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={3}
                  stroke="currentColor"
                  className="w-8 h-8 text-[#0066FF]"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                  />
                </svg>
                Saved Bids
              </h2>
              <p className="text-sm font-bold text-black/70 mb-6">
                Your committed bid data stored locally. This data is critical for revealing your bids.
              </p>

              <div className="flex-1">
                {savedBids.length === 0 ? (
                  <div className="text-center py-12 bg-[#E5E5E5] border-2 border-black border-dashed">
                    <p className="text-lg font-black text-black/40 uppercase tracking-wider">No saved bids yet.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto border-2 border-black">
                    <table className="table w-full">
                      <thead className="bg-[#E5E5E5] text-black font-black uppercase text-xs border-b-2 border-black">
                        <tr>
                          <th className="rounded-none">Auction</th>
                          <th>Amount (Wei)</th>
                          <th>Status</th>
                          <th className="rounded-none"></th>
                        </tr>
                      </thead>
                      <tbody className="text-black font-bold text-sm">
                        {savedBids.map((bid, i) => (
                          <tr
                            key={bid.auctionId}
                            className={i !== savedBids.length - 1 ? "border-b-2 border-black" : ""}
                          >
                            <td>
                              <Link href={`/auction/${bid.auctionId}`} className="text-[#0066FF] hover:underline">
                                #{bid.auctionId}
                              </Link>
                            </td>
                            <td className="font-mono text-xs">
                              {(() => {
                                try {
                                  return BigInt(bid.bidAmount).toString().slice(0, 12) + "...";
                                } catch {
                                  return bid.bidAmount;
                                }
                              })()}
                            </td>
                            <td>
                              {bid.revealed ? (
                                <span className="bg-[#0066FF] text-white px-2 py-1 text-xs border border-black shadow-[1px_1px_0px_#000]">
                                  Revealed
                                </span>
                              ) : bid.committed ? (
                                <span className="bg-[#FFD700] text-black px-2 py-1 text-xs border border-black shadow-[1px_1px_0px_#000]">
                                  Committed
                                </span>
                              ) : (
                                <span className="bg-[#E5E5E5] text-black px-2 py-1 text-xs border border-black shadow-[1px_1px_0px_#000]">
                                  Draft
                                </span>
                              )}
                            </td>
                            <td>
                              <Link
                                href={`/auction/${bid.auctionId}`}
                                className="bg-white border border-black px-3 py-1 hover:bg-[#E5E5E5] transition-colors shadow-[1px_1px_0px_#000]"
                              >
                                View
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="mt-6 bg-[#E60000] text-white border-4 border-black p-4 shadow-[4px_4px_0px_#000] flex gap-3">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={3}
                  stroke="currentColor"
                  className="w-6 h-6 shrink-0"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                  />
                </svg>
                <span className="text-xs font-bold leading-tight">
                  Bid data is stored in your browser&apos;s localStorage. Clearing browser data will permanently lose
                  this information and you won&apos;t be able to reveal those bids.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ===== STEALTH ANNOUNCEMENTS ===== */}
        <div className="bg-white border-4 border-black shadow-[8px_8px_0px_#0066FF] mt-8 relative">
          <div className="p-6 md:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b-4 border-black pb-4">
              <h2 className="text-2xl font-black uppercase flex items-center gap-3 text-black">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={3}
                  stroke="currentColor"
                  className="w-8 h-8 text-[#0066FF]"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
                  />
                </svg>
                Stealth Announcements
              </h2>
              <button
                onClick={fetchAnnouncements}
                disabled={announcementsLoading}
                className="bg-white text-black border-2 border-black font-black uppercase px-6 py-2 shadow-[4px_4px_0px_#000] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[2px_2px_0px_#000] transition-all disabled:opacity-50"
              >
                {announcementsLoading ? <span className="loading loading-spinner loading-sm" /> : "Refresh"}
              </button>
            </div>

            <p className="text-sm font-bold text-black/70 mb-6">
              These are payments sent to your stealth addresses. Use your viewing key to identify which ones belong to
              you.
            </p>

            {announcements.length === 0 ? (
              <div className="text-center py-12 bg-[#E5E5E5] border-2 border-black border-dashed">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-16 h-16 mx-auto mb-4 text-black/20"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
                  />
                </svg>
                <p className="text-xl font-black text-black/40 uppercase tracking-wider">No announcements yet.</p>
                <p className="text-sm font-bold text-black/40 mt-2">Announcements appear after auction settlement.</p>
              </div>
            ) : (
              <div className="overflow-x-auto border-4 border-black">
                <table className="table w-full">
                  <thead className="bg-[#0066FF] text-white font-black uppercase text-sm border-b-4 border-black">
                    <tr>
                      <th className="rounded-none py-4">Auction</th>
                      <th className="py-4">Stealth Address</th>
                      <th className="rounded-none py-4">Ephemeral Key</th>
                    </tr>
                  </thead>
                  <tbody className="text-black font-bold bg-white">
                    {announcements.map((ann, i) => (
                      <tr key={ann.id} className={i !== announcements.length - 1 ? "border-b-2 border-black" : ""}>
                        <td className="py-4">
                          <Link href={`/auction/${ann.auctionId}`} className="text-[#0066FF] hover:underline text-lg">
                            #{ann.auctionId}
                          </Link>
                        </td>
                        <td className="font-mono text-sm py-4">
                          <span className="bg-[#E5E5E5] px-2 py-1 border border-black">
                            {ann.stealthAddress.slice(0, 10)}...{ann.stealthAddress.slice(-8)}
                          </span>
                        </td>
                        <td className="font-mono text-sm py-4">
                          <span className="bg-[#E5E5E5] px-2 py-1 border border-black">
                            {ann.ephemeralPublicKey.slice(0, 10)}...{ann.ephemeralPublicKey.slice(-8)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ===== QUICK LINKS ===== */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-8">
          <Link
            href="/"
            className="bg-white border-4 border-black p-6 flex flex-col items-center justify-center gap-4 shadow-[6px_6px_0px_#0066FF] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[4px_4px_0px_#0066FF] transition-all group"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-10 h-10 text-black group-hover:text-[#0066FF] transition-colors"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z"
              />
            </svg>
            <span className="text-lg font-black uppercase tracking-wider text-black">Browse Auctions</span>
          </Link>
          <Link
            href="/auction/create"
            className="bg-white border-4 border-black p-6 flex flex-col items-center justify-center gap-4 shadow-[6px_6px_0px_#0066FF] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[4px_4px_0px_#0066FF] transition-all group"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-10 h-10 text-black group-hover:text-[#0066FF] transition-colors"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span className="text-lg font-black uppercase tracking-wider text-black">Create Auction</span>
          </Link>
          <Link
            href="/debug"
            className="bg-white border-4 border-black p-6 flex flex-col items-center justify-center gap-4 shadow-[6px_6px_0px_#0066FF] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[4px_4px_0px_#0066FF] transition-all group"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-10 h-10 text-black group-hover:text-[#0066FF] transition-colors"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z"
              />
            </svg>
            <span className="text-lg font-black uppercase tracking-wider text-black">Debug Contracts</span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Profile;
