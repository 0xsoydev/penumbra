"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Address } from "@scaffold-ui/components";
import type { NextPage } from "next";
import { formatEther, parseEther } from "viem";
import { useAccount, useSendTransaction } from "wagmi";
import { CountdownTimer } from "~~/components/penumbra/CountdownTimer";
import { PhaseIndicator } from "~~/components/penumbra/PhaseIndicator";
import { useBidStorage } from "~~/hooks/penumbra/useBidStorage";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { AuctionData, AuctionPhase, AuctionStatusResponse } from "~~/types/auction";
import { notification } from "~~/utils/scaffold-eth";

const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

const AuctionDetail: NextPage = () => {
  const params = useParams();
  const auctionId = Number(params.id);
  const { address, isConnected } = useAccount();

  // --- State ---
  const [bidAmount, setBidAmount] = useState("");
  const [depositAddress, setDepositAddress] = useState<string | null>(null);
  const [ethSent, setEthSent] = useState(false);
  const [ethTxHash, setEthTxHash] = useState<string | null>(null);
  const [bidLoading, setBidLoading] = useState(false);
  const [bidStep, setBidStep] = useState<"idle" | "registering" | "sending" | "done">("idle");
  const [backendStatus, setBackendStatus] = useState<AuctionStatusResponse | null>(null);
  const [settleLoading, setSettleLoading] = useState(false);
  const [claimLoading, setClaimLoading] = useState(false);
  const [settlementResult, setSettlementResult] = useState<{
    winningBidWei: string;
    payoutStatus: string;
    bitgoTxId?: string;
    sellerAddress?: string;
  } | null>(null);

  // --- ETH transfer hook ---
  const { sendTransactionAsync } = useSendTransaction();

  // --- Bid storage (localStorage) ---
  const { saveBid, getBid } = useBidStorage();

  // --- On-chain write ---
  const { writeContractAsync: writeAuctionAsync } = useScaffoldWriteContract({ contractName: "PenumbraAuction" });

  // --- On-chain reads ---
  const { data: auctionData, refetch: refetchAuction } = useScaffoldReadContract({
    contractName: "PenumbraAuction",
    functionName: "getAuction",
    args: [BigInt(auctionId)],
  });

  const { data: phase, refetch: refetchPhase } = useScaffoldReadContract({
    contractName: "PenumbraAuction",
    functionName: "getAuctionPhase",
    args: [BigInt(auctionId)],
  });

  const { data: commitCount } = useScaffoldReadContract({
    contractName: "PenumbraAuction",
    functionName: "getCommitCount",
    args: [BigInt(auctionId)],
  });

  // --- Derived data ---
  const auction: AuctionData | null = auctionData
    ? {
        seller: (auctionData as unknown as AuctionData).seller,
        tokenAddress: (auctionData as unknown as AuctionData).tokenAddress,
        tokenAmount: (auctionData as unknown as AuctionData).tokenAmount,
        minimumBid: (auctionData as unknown as AuctionData).minimumBid,
        commitDeadline: (auctionData as unknown as AuctionData).commitDeadline,
        settleDeadline: (auctionData as unknown as AuctionData).settleDeadline,
        winningNullifier: (auctionData as unknown as AuctionData).winningNullifier,
        claimed: (auctionData as unknown as AuctionData).claimed,
        cancelled: (auctionData as unknown as AuctionData).cancelled,
      }
    : null;

  const currentPhase = phase as AuctionPhase | undefined;
  const bidderCount = commitCount ? Number(commitCount) : 0;
  const isSeller = auction && address && auction.seller.toLowerCase() === address.toLowerCase();
  const hasWinner = auction && auction.winningNullifier !== ZERO_BYTES32;

  // --- Fetch backend status ---
  const fetchBackendStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/auction/${auctionId}/status`);
      if (res.ok) {
        const data = await res.json();
        setBackendStatus(data);
      }
    } catch (e) {
      console.error("Failed to fetch backend status:", e);
    }
  }, [auctionId]);

  useEffect(() => {
    fetchBackendStatus();
    const interval = setInterval(fetchBackendStatus, 15000);
    return () => clearInterval(interval);
  }, [fetchBackendStatus]);

  // --- Auto-refresh on-chain data ---
  useEffect(() => {
    const interval = setInterval(() => {
      refetchAuction();
      refetchPhase();
    }, 10000);
    return () => clearInterval(interval);
  }, [refetchAuction, refetchPhase]);

  // --- Request Deposit Address + Place Bid (ZK flow) ---
  const handlePlaceBid = async () => {
    if (!bidAmount || !address) return;
    setBidLoading(true);
    setBidStep("registering");
    try {
      const res = await fetch(`/api/auction/${auctionId}/deposit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bidderAddress: address.toLowerCase(),
          bidAmountWei: parseEther(bidAmount).toString(),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        notification.error(err.error || "Failed to register bid");
        setBidStep("idle");
        setBidLoading(false);
        return;
      }

      const data = await res.json();
      const targetAddress = data.depositAddress;
      setDepositAddress(targetAddress);

      saveBid({
        auctionId,
        bidAmount: parseEther(bidAmount).toString(),
        salt: data.salt,
        secret: data.secret,
        nullifier: data.nullifier,
        committed: true,
        revealed: false,
      });

      setBidStep("sending");
      try {
        const txHash = await sendTransactionAsync({
          to: targetAddress as `0x${string}`,
          value: parseEther(bidAmount),
        });
        setEthTxHash(txHash);
        setEthSent(true);
        setBidStep("done");
        notification.success("Bid placed and ETH sent successfully!");
      } catch (sendError) {
        console.error("ETH send failed:", sendError);
        setBidStep("done");
        notification.warning("Bid registered on-chain, but ETH transfer was not completed. You can send ETH manually.");
      }
    } catch (e) {
      console.error("Place bid error:", e);
      notification.error("Failed to place bid");
      setBidStep("idle");
    } finally {
      setBidLoading(false);
    }
  };

  // --- Trigger Settlement (admin) ---
  const handleSettle = async () => {
    setSettleLoading(true);
    try {
      const res = await fetch(`/api/auction/${auctionId}/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (res.ok) {
        const data = await res.json();
        const payout = data.settlement?.payout;
        notification.success(
          `Settlement complete! Seller payout: ${payout?.amountWei ? formatEther(BigInt(payout.amountWei)) + " ETH" : "pending"}`,
        );
        setSettlementResult({
          winningBidWei: data.settlement.winningBidWei,
          payoutStatus: payout?.status ?? "unknown",
          bitgoTxId: payout?.bitgoTxId,
          sellerAddress: payout?.sellerAddress,
        });
        refetchAuction();
        refetchPhase();
        fetchBackendStatus();
      } else {
        const err = await res.json();
        notification.error(err.error || "Settlement failed");
      }
    } catch (e) {
      console.error("Settle error:", e);
      notification.error("Settlement failed");
    } finally {
      setSettleLoading(false);
    }
  };

  // --- Claim with ZK Proof (winner) ---
  const handleClaim = async () => {
    if (!address) return;

    const storedBid = getBid(auctionId);
    if (!storedBid?.secret) {
      notification.error("No secret found for this auction. Did you bid from this browser?");
      return;
    }

    setClaimLoading(true);
    try {
      const res = await fetch(`/api/auction/${auctionId}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: storedBid.secret }),
      });

      if (!res.ok) {
        const err = await res.json();
        notification.error(err.error || "Claim failed");
        return;
      }

      const data = await res.json();
      const proofHex: `0x${string}` = data.proofHex;

      notification.info("ZK proof generated — submitting on-chain...");

      await writeAuctionAsync({
        functionName: "claimWithProof",
        args: [BigInt(auctionId), proofHex, address],
        gas: 3_000_000n,
      });

      notification.success("Tokens claimed successfully via ZK proof!");
      refetchAuction();
      refetchPhase();
    } catch (e) {
      console.error("Claim error:", e);
      notification.error("Claim failed");
    } finally {
      setClaimLoading(false);
    }
  };

  // --- Cancel Auction ---
  const handleCancel = async () => {
    try {
      const res = await fetch(`/api/auction/${auctionId}/settle`, {
        method: "DELETE",
      });
      if (res.ok) {
        notification.success("Auction cancelled. Tokens refunded.");
      }
    } catch (e) {
      console.error("Cancel error:", e);
    }
    refetchAuction();
    refetchPhase();
  };

  // --- Loading ---
  if (!auction || currentPhase === undefined) {
    return (
      <div className="flex justify-center items-center flex-1 py-20 bg-[#E5E5E5] min-h-screen">
        <span className="loading loading-spinner loading-lg text-black" />
      </div>
    );
  }

  const depositSummary = backendStatus?.deposits ?? null;

  // Derive payout display from either the just-completed settlement or the polling status
  const payoutDisplay = settlementResult
    ? {
        paid: settlementResult.payoutStatus === "paid",
        amountWei: settlementResult.winningBidWei,
        bitgoTxId: settlementResult.bitgoTxId ?? null,
        sellerStealth: settlementResult.sellerAddress ?? null,
      }
    : backendStatus?.payout?.paid
      ? {
          paid: true,
          amountWei: backendStatus.payout.winningBidWei,
          bitgoTxId: backendStatus.payout.bitgoTxId,
          sellerStealth: null,
        }
      : null;

  return (
    <div className="flex-1 py-12 px-4 sm:px-6 bg-[#E5E5E5] min-h-screen">
      <div className="max-w-5xl mx-auto">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-8 text-black font-black uppercase text-sm border-4 border-black bg-white inline-flex px-4 py-2 shadow-[4px_4px_0px_#000]">
          <Link href="/" className="hover:text-[#0066FF] hover:underline">
            Auctions
          </Link>
          <span>/</span>
          <span className="text-[#0066FF]">Auction #{auctionId}</span>
        </div>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-10">
          <div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight flex items-center gap-4 text-black uppercase mb-4">
              Auction #{auctionId}
              <PhaseIndicator phase={currentPhase} size="lg" />
            </h1>
            <div className="flex items-center gap-3 text-sm font-bold bg-white border-4 border-black px-4 py-2 shadow-[4px_4px_0px_#000] inline-flex text-black">
              <span className="uppercase tracking-wider">Seller:</span>
              <Address address={auction.seller} size="sm" />
              {isSeller && (
                <span className="bg-[#E60000] text-white px-2 py-1 border-2 border-black text-xs uppercase font-black tracking-wider shadow-[2px_2px_0px_#000]">
                  You
                </span>
              )}
            </div>
          </div>

          {/* Countdown timers */}
          <div className="flex flex-col gap-4">
            {(currentPhase === AuctionPhase.COMMIT || currentPhase === AuctionPhase.SETTLE) && (
              <>
                <div className="bg-white border-4 border-black p-3 shadow-[4px_4px_0px_#000]">
                  <CountdownTimer deadline={auction.commitDeadline} label="Commit Deadline" />
                </div>
                <div className="bg-white border-4 border-black p-3 shadow-[4px_4px_0px_#000]">
                  <CountdownTimer deadline={auction.settleDeadline} label="Settle Deadline" />
                </div>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* ===== LEFT COLUMN: Auction Info ===== */}
          <div className="lg:col-span-2 space-y-8">
            {/* Token Details Card */}
            <div className="bg-white border-4 border-black shadow-[8px_8px_0px_#0066FF] relative flex flex-col">
              <div className="p-6 md:p-8">
                <h2 className="text-2xl font-black uppercase text-black border-b-4 border-black pb-4 mb-6">
                  Auction Details
                </h2>
                <div className="grid grid-cols-2 gap-6">
                  <div className="bg-[#E5E5E5] border-2 border-black p-4 shadow-[4px_4px_0px_#000]">
                    <p className="text-xs font-black uppercase tracking-wider text-black mb-2">Token Amount</p>
                    <p className="font-mono font-bold text-xl text-black bg-white p-2 border border-black mb-2">
                      {formatEther(auction.tokenAmount)}
                    </p>
                    <p className="text-xs text-black/70 font-mono truncate bg-white p-1 border border-black">
                      {auction.tokenAddress}
                    </p>
                  </div>
                  <div className="bg-[#E5E5E5] border-2 border-black p-4 shadow-[4px_4px_0px_#000]">
                    <p className="text-xs font-black uppercase tracking-wider text-black mb-2">Minimum Bid</p>
                    <p className="font-mono font-bold text-xl text-black bg-white p-2 border border-black">
                      {formatEther(auction.minimumBid)} ETH
                    </p>
                  </div>
                  <div className="bg-[#E5E5E5] border-2 border-black p-4 shadow-[4px_4px_0px_#000]">
                    <p className="text-xs font-black uppercase tracking-wider text-black mb-2">Sealed Bids</p>
                    <p className="font-mono font-bold text-xl text-black bg-white p-2 border border-black">
                      {bidderCount}
                    </p>
                  </div>
                  <div className="bg-[#E5E5E5] border-2 border-black p-4 shadow-[4px_4px_0px_#000]">
                    <p className="text-xs font-black uppercase tracking-wider text-black mb-2">Status</p>
                    <p className="font-bold text-xl text-black bg-white p-2 border border-black uppercase">
                      {auction.claimed ? "Claimed" : auction.cancelled ? "Cancelled" : "Active"}
                    </p>
                  </div>
                </div>

                {/* Winner info (nullifier-based) */}
                {hasWinner && (
                  <div className="mt-8 bg-[#0066FF] text-white border-4 border-black p-6 shadow-[4px_4px_0px_#000]">
                    <p className="text-lg font-black uppercase tracking-wider mb-2">Winner Declared</p>
                    <p className="font-mono text-sm break-all bg-white text-black p-3 border-2 border-black font-bold">
                      Nullifier: {auction.winningNullifier}
                    </p>
                    <p className="text-sm font-bold mt-3">
                      {auction.claimed ? "Tokens claimed via ZK proof" : "Winner can claim tokens with ZK proof"}
                    </p>
                  </div>
                )}

                {/* Seller Payout Result */}
                {payoutDisplay && (
                  <div className="mt-8 bg-white border-4 border-black p-6 shadow-[4px_4px_0px_#0066FF]">
                    <p className="text-lg font-black uppercase tracking-wider text-black mb-4 border-b-4 border-black pb-3">
                      Seller Payout
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="bg-[#E5E5E5] border-2 border-black p-4 shadow-[4px_4px_0px_#000]">
                        <p className="text-xs font-black uppercase tracking-wider text-black mb-2">Status</p>
                        <p
                          className={`font-black text-xl uppercase p-2 border border-black ${payoutDisplay.paid ? "bg-[#0066FF] text-white" : "bg-[#FFD700] text-black"}`}
                        >
                          {payoutDisplay.paid ? "Paid" : "Pending"}
                        </p>
                      </div>
                      <div className="bg-[#E5E5E5] border-2 border-black p-4 shadow-[4px_4px_0px_#000]">
                        <p className="text-xs font-black uppercase tracking-wider text-black mb-2">Amount</p>
                        <p className="font-mono font-bold text-xl text-black bg-white p-2 border border-black">
                          {payoutDisplay.amountWei ? `${formatEther(BigInt(payoutDisplay.amountWei))} ETH` : "—"}
                        </p>
                      </div>
                    </div>
                    {payoutDisplay.bitgoTxId && (
                      <div className="mt-4 bg-[#E5E5E5] border-2 border-black p-4 shadow-[4px_4px_0px_#000]">
                        <p className="text-xs font-black uppercase tracking-wider text-black mb-2">BitGo Tx ID</p>
                        <p className="font-mono text-xs break-all bg-white p-2 border border-black font-bold text-black">
                          {payoutDisplay.bitgoTxId}
                        </p>
                      </div>
                    )}
                    {payoutDisplay.sellerStealth && (
                      <div className="mt-4 bg-[#E5E5E5] border-2 border-black p-4 shadow-[4px_4px_0px_#000]">
                        <p className="text-xs font-black uppercase tracking-wider text-black mb-2">
                          Sent to Stealth Address
                        </p>
                        <p className="font-mono text-xs break-all bg-white p-2 border border-black font-bold text-black">
                          {payoutDisplay.sellerStealth}
                        </p>
                      </div>
                    )}
                    <p className="text-xs font-bold text-black/70 bg-[#FFD700] border-2 border-black p-3 shadow-[2px_2px_0px_#000] mt-4">
                      {payoutDisplay.sellerStealth
                        ? "ETH sent to a stealth address — seller identity protected."
                        : "ETH sent to seller via BitGo custody."}
                    </p>
                  </div>
                )}

                {/* Cancelled info */}
                {currentPhase === AuctionPhase.CANCELLED && (
                  <div className="mt-8 bg-[#E60000] text-white border-4 border-black p-6 shadow-[4px_4px_0px_#000]">
                    <p className="text-lg font-black uppercase tracking-wider">
                      This auction has been cancelled. Tokens were refunded to the seller.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Backend Deposit Status */}
            {depositSummary && depositSummary.total > 0 && (
              <div className="bg-white border-4 border-black shadow-[8px_8px_0px_#0066FF] relative flex flex-col">
                <div className="p-6 md:p-8">
                  <h2 className="text-2xl font-black uppercase text-black border-b-4 border-black pb-4 mb-6">
                    ETH Deposits (BitGo)
                  </h2>
                  <div className="grid grid-cols-3 gap-6">
                    <div className="bg-[#E5E5E5] border-2 border-black p-4 shadow-[4px_4px_0px_#000] text-center">
                      <p className="text-xs font-black uppercase tracking-wider text-black mb-2">Total</p>
                      <p className="font-mono font-bold text-xl text-black bg-white p-2 border border-black">
                        {depositSummary.total}
                      </p>
                    </div>
                    <div className="bg-[#E5E5E5] border-2 border-black p-4 shadow-[4px_4px_0px_#000] text-center">
                      <p className="text-xs font-black uppercase tracking-wider text-black mb-2">Committed</p>
                      <p className="font-mono font-bold text-xl text-black bg-white p-2 border border-black">
                        {depositSummary.committed}
                      </p>
                    </div>
                    <div className="bg-[#E5E5E5] border-2 border-black p-4 shadow-[4px_4px_0px_#000] text-center">
                      <p className="text-xs font-black uppercase tracking-wider text-black mb-2">Confirmed</p>
                      <p className="font-mono font-bold text-xl text-black bg-white p-2 border border-black">
                        {depositSummary.confirmed}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-black/70 mt-4 bg-[#FFD700] border-2 border-black p-3 shadow-[2px_2px_0px_#000]">
                    Bidder identities are hidden to preserve privacy.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ===== RIGHT COLUMN: Actions ===== */}
          <div className="space-y-8">
            {/* --- COMMIT PHASE ACTIONS --- */}
            {currentPhase === AuctionPhase.COMMIT && isConnected && !isSeller && (
              <div className="bg-white border-4 border-black shadow-[8px_8px_0px_#0066FF] relative flex flex-col">
                <div className="p-6 md:p-8">
                  <h2 className="text-2xl font-black uppercase text-black border-b-4 border-black pb-4 mb-6">
                    Place Your Bid
                  </h2>

                  {depositAddress ? (
                    <div className="space-y-6">
                      {ethSent ? (
                        <div className="bg-[#0066FF] text-white border-4 border-black p-4 shadow-[4px_4px_0px_#000] flex gap-3">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={3}
                            stroke="currentColor"
                            className="w-6 h-6 shrink-0"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                          <span className="text-sm font-black uppercase tracking-wider">Bid placed and ETH sent!</span>
                        </div>
                      ) : (
                        <div className="bg-[#FFD700] text-black border-4 border-black p-4 shadow-[4px_4px_0px_#000] flex gap-3">
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
                          <span className="text-sm font-black uppercase tracking-wider">
                            Bid registered, but ETH was not sent. Send manually below.
                          </span>
                        </div>
                      )}

                      {ethTxHash && (
                        <div className="bg-[#E5E5E5] border-2 border-black p-4 shadow-[4px_4px_0px_#000]">
                          <p className="text-xs font-black uppercase tracking-wider text-black mb-2">
                            ETH Transfer Tx:
                          </p>
                          <p className="font-mono text-xs break-all bg-white p-2 border border-black font-bold">
                            {ethTxHash}
                          </p>
                        </div>
                      )}

                      {!ethSent && (
                        <div className="space-y-4">
                          <p className="text-sm font-bold text-black/70">
                            Send {bidAmount} ETH to this deposit address:
                          </p>
                          <div className="bg-white border-4 border-black p-4 font-mono text-sm break-all font-bold shadow-[4px_4px_0px_#000]">
                            {depositAddress}
                          </div>
                          <div className="flex flex-col gap-4">
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(depositAddress);
                                notification.success("Copied!");
                              }}
                              className="w-full py-3 bg-white text-black border-4 border-black font-black uppercase tracking-wider shadow-[4px_4px_0px_#000] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[2px_2px_0px_#000] transition-all"
                            >
                              Copy Address
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  setBidLoading(true);
                                  const txHash = await sendTransactionAsync({
                                    to: depositAddress as `0x${string}`,
                                    value: parseEther(bidAmount),
                                  });
                                  setEthTxHash(txHash);
                                  setEthSent(true);
                                  notification.success("ETH sent successfully!");
                                } catch (e) {
                                  console.error("Retry ETH send failed:", e);
                                  notification.error("ETH transfer failed");
                                } finally {
                                  setBidLoading(false);
                                }
                              }}
                              disabled={bidLoading}
                              className="w-full py-4 bg-[#0066FF] text-white border-4 border-black font-black text-xl uppercase tracking-wider shadow-[6px_6px_0px_#000000] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[4px_4px_0px_#000000] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            >
                              {bidLoading ? (
                                <span className="flex items-center justify-center gap-3">
                                  <span className="loading loading-spinner loading-md" />
                                  Sending...
                                </span>
                              ) : (
                                `Send ${bidAmount} ETH`
                              )}
                            </button>
                          </div>
                        </div>
                      )}

                      <p className="text-xs font-bold text-black/70 bg-[#E5E5E5] p-3 border-2 border-black shadow-[2px_2px_0px_#000]">
                        Your bid has been sealed with a ZK commitment. Your identity and bid amount are fully private --
                        they never appear on-chain.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="flex flex-col gap-2">
                        <label className="text-sm font-black uppercase tracking-wider text-black flex justify-between">
                          <span>Bid Amount (ETH)</span>
                          <span className="text-black/60">Min: {formatEther(auction.minimumBid)} ETH</span>
                        </label>
                        <input
                          type="number"
                          value={bidAmount}
                          onChange={e => setBidAmount(e.target.value)}
                          placeholder={formatEther(auction.minimumBid)}
                          min="0"
                          step="any"
                          className="w-full p-4 border-4 border-black font-mono text-lg font-bold bg-white text-black focus:outline-none focus:ring-0 focus:border-[#0066FF] shadow-[4px_4px_0px_#000]"
                        />
                      </div>

                      <button
                        onClick={handlePlaceBid}
                        disabled={bidLoading || !bidAmount}
                        className="w-full py-4 bg-[#0066FF] text-white border-4 border-black font-black text-xl uppercase tracking-wider shadow-[6px_6px_0px_#000000] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[4px_4px_0px_#000000] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      >
                        {bidLoading ? (
                          <span className="flex items-center justify-center gap-3">
                            <span className="loading loading-spinner loading-md" />
                            {bidStep === "registering" ? "Registering..." : "Confirming..."}
                          </span>
                        ) : (
                          "Place Sealed Bid"
                        )}
                      </button>

                      <div className="bg-[#E5E5E5] text-black border-4 border-black p-4 shadow-[4px_4px_0px_#000] flex gap-3">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={3}
                          stroke="currentColor"
                          className="w-6 h-6 shrink-0 text-[#0066FF]"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
                          />
                        </svg>
                        <span className="text-xs font-bold leading-relaxed">
                          Full privacy: your bid amount and identity are never posted on-chain. A ZK nullifier protects
                          your anonymity.
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* --- SETTLE PHASE ACTIONS (Admin triggers settlement) --- */}
            {currentPhase === AuctionPhase.SETTLE && (
              <div className="bg-white border-4 border-black shadow-[8px_8px_0px_#0066FF] relative flex flex-col">
                <div className="p-6 md:p-8">
                  <h2 className="text-2xl font-black uppercase text-black border-b-4 border-black pb-4 mb-4">
                    Settlement
                  </h2>
                  <p className="text-sm font-bold text-black/70 mb-6">
                    The commit phase has ended. The backend will determine the highest bid off-chain and declare the
                    winner on-chain using only their nullifier.
                  </p>
                  <button
                    onClick={handleSettle}
                    disabled={settleLoading}
                    className="w-full py-4 bg-[#FFD700] text-black border-4 border-black font-black text-xl uppercase tracking-wider shadow-[6px_6px_0px_#000000] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[4px_4px_0px_#000000] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {settleLoading ? (
                      <span className="flex items-center justify-center gap-3">
                        <span className="loading loading-spinner loading-md" />
                        Settling...
                      </span>
                    ) : (
                      "Trigger Settlement"
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* --- ENDED: Winner can claim with ZK proof --- */}
            {currentPhase === AuctionPhase.ENDED && hasWinner && !auction.claimed && (
              <div className="bg-white border-4 border-black shadow-[8px_8px_0px_#0066FF] relative flex flex-col">
                <div className="p-6 md:p-8">
                  <h2 className="text-2xl font-black uppercase text-black border-b-4 border-black pb-4 mb-4">
                    Claim with ZK Proof
                  </h2>
                  <p className="text-sm font-bold text-black/70 mb-6">
                    If you are the winner, claim your tokens by generating a ZK proof that you know the secret behind
                    the winning nullifier.
                  </p>
                  <button
                    onClick={handleClaim}
                    disabled={claimLoading || !isConnected}
                    className="w-full py-4 bg-[#0066FF] text-white border-4 border-black font-black text-xl uppercase tracking-wider shadow-[6px_6px_0px_#000000] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[4px_4px_0px_#000000] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {claimLoading ? (
                      <span className="flex items-center justify-center gap-3">
                        <span className="loading loading-spinner loading-md" />
                        Generating proof...
                      </span>
                    ) : (
                      "Claim with ZK Proof"
                    )}
                  </button>
                  <p className="text-xs font-bold text-black/70 bg-[#E5E5E5] p-3 border-2 border-black shadow-[2px_2px_0px_#000] mt-6">
                    The proof is generated server-side and submitted from a burner wallet. Your real identity is never
                    revealed.
                  </p>
                </div>
              </div>
            )}

            {/* --- CLAIMED SUCCESS --- */}
            {auction.claimed && (
              <div className="bg-[#0066FF] text-white border-4 border-black shadow-[8px_8px_0px_#000] relative flex flex-col">
                <div className="p-6 md:p-8">
                  <h2 className="text-2xl font-black uppercase border-b-4 border-black pb-4 mb-4">Claimed</h2>
                  <p className="text-sm font-bold">
                    This auction has been settled and tokens claimed via ZK proof. Check your{" "}
                    <Link href="/profile" className="text-[#FFD700] hover:underline underline-offset-4 font-black">
                      profile
                    </Link>{" "}
                    for stealth announcements.
                  </p>
                </div>
              </div>
            )}

            {/* --- SELLER CANCEL ACTION --- */}
            {isSeller && !auction.claimed && !auction.cancelled && (
              <div className="bg-white border-4 border-black shadow-[8px_8px_0px_#E60000] relative flex flex-col">
                <div className="p-6 md:p-8">
                  <h2 className="text-2xl font-black uppercase text-black border-b-4 border-black pb-4 mb-4">
                    Seller Actions
                  </h2>
                  <button
                    onClick={handleCancel}
                    className="w-full py-4 bg-white text-[#E60000] border-4 border-[#E60000] font-black text-xl uppercase tracking-wider shadow-[6px_6px_0px_#E60000] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[4px_4px_0px_#E60000] transition-all"
                  >
                    Cancel Auction
                  </button>
                  <p className="text-xs font-bold text-black/70 bg-[#E5E5E5] p-3 border-2 border-black shadow-[2px_2px_0px_#000] mt-6">
                    Cancelling will refund all tokens back to you. This cannot be undone.
                  </p>
                </div>
              </div>
            )}

            {/* --- NOT CONNECTED --- */}
            {!isConnected && (
              <div className="bg-[#E5E5E5] border-4 border-black shadow-[8px_8px_0px_#000] relative flex flex-col items-center text-center">
                <div className="p-6 md:p-8">
                  <h2 className="text-2xl font-black uppercase text-black mb-4">Connect Wallet</h2>
                  <p className="text-sm font-bold text-black border-2 border-black px-4 py-2 bg-white shadow-[2px_2px_0px_#000]">
                    Connect your wallet to place bids or manage this auction.
                  </p>
                </div>
              </div>
            )}

            {/* --- INFO CARD --- */}
            <div className="bg-white border-4 border-black p-6 shadow-[8px_8px_0px_#0066FF]">
              <h3 className="font-black text-lg uppercase tracking-wider text-black border-b-4 border-black pb-3 mb-4">
                How ZK Sealed-Bid Auctions Work
              </h3>
              <ul className="text-xs font-bold text-black space-y-3">
                <li className="flex gap-2">
                  <span className="text-[#0066FF] font-black">▶</span>
                  <span>
                    <strong>Commit:</strong> Submit a sealed bid (amount + identity hidden via ZK nullifier)
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-[#0066FF] font-black">▶</span>
                  <span>
                    <strong>Deposit:</strong> Send ETH to your unique BitGo deposit address
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-[#0066FF] font-black">▶</span>
                  <span>
                    <strong>Settlement:</strong> Backend reveals bids off-chain, declares winner by nullifier
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-[#0066FF] font-black">▶</span>
                  <span>
                    <strong>Claim:</strong> Winner proves knowledge of secret via ZK proof
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-[#0066FF] font-black">▶</span>
                  <span>
                    <strong>Refunds:</strong> Non-winners get ETH refunded automatically
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuctionDetail;
