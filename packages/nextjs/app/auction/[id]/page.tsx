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
      // Step 1: Register bid with backend (creates BitGo deposit address, commits on-chain)
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

      // Persist the secret/nullifier/salt so we can claim later
      saveBid({
        auctionId,
        bidAmount,
        salt: data.salt,
        secret: data.secret,
        nullifier: data.nullifier,
        committed: true,
        revealed: false,
      });

      // Step 2: Trigger MetaMask to send ETH to the BitGo deposit address
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
        // User rejected MetaMask or tx failed — bid is committed but ETH not sent
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
        notification.success(
          `Settlement complete! Winning nullifier: ${data.settlement.winningNullifier?.slice(0, 10)}...`,
        );
        refetchAuction();
        refetchPhase();
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

    // Read secret from localStorage
    const storedBid = getBid(auctionId);
    if (!storedBid?.secret) {
      notification.error("No secret found for this auction. Did you bid from this browser?");
      return;
    }

    setClaimLoading(true);
    try {
      // Step 1: Ask backend to generate the ZK proof
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

      // Step 2: Submit claimWithProof on-chain (uses ~2.56M gas)
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
    // Call cancel via the contract directly (seller or owner can cancel)
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
      <div className="flex justify-center items-center flex-1 py-20">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  // Deposit summary counts from backend (privacy-safe — no individual addresses)
  const depositSummary = backendStatus?.deposits ?? null;

  return (
    <div className="flex-1 py-8 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto">
        {/* Breadcrumb */}
        <div className="text-sm breadcrumbs mb-6">
          <ul>
            <li>
              <Link href="/">Auctions</Link>
            </li>
            <li className="font-bold">Auction #{auctionId}</li>
          </ul>
        </div>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
              Auction #{auctionId}
              <PhaseIndicator phase={currentPhase} size="lg" />
            </h1>
            <div className="flex items-center gap-2 mt-2 text-sm opacity-70">
              <span>Seller:</span>
              <Address address={auction.seller} size="sm" />
              {isSeller && <span className="badge badge-outline badge-sm">You</span>}
            </div>
          </div>

          {/* Countdown timers */}
          <div className="flex gap-6">
            {(currentPhase === AuctionPhase.COMMIT || currentPhase === AuctionPhase.SETTLE) && (
              <>
                <CountdownTimer deadline={auction.commitDeadline} label="Commit Deadline" />
                <CountdownTimer deadline={auction.settleDeadline} label="Settle Deadline" />
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ===== LEFT COLUMN: Auction Info ===== */}
          <div className="lg:col-span-2 space-y-6">
            {/* Token Details Card */}
            <div className="card bg-base-100 shadow-xl border border-base-300">
              <div className="card-body">
                <h2 className="card-title text-lg font-bold">Auction Details</h2>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div className="bg-base-200 rounded-lg p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider opacity-50 mb-1">Token Amount</p>
                    <p className="font-mono font-bold text-lg">{formatEther(auction.tokenAmount)}</p>
                    <p className="text-xs opacity-50 font-mono truncate">{auction.tokenAddress}</p>
                  </div>
                  <div className="bg-base-200 rounded-lg p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider opacity-50 mb-1">Minimum Bid</p>
                    <p className="font-mono font-bold text-lg">{formatEther(auction.minimumBid)} ETH</p>
                  </div>
                  <div className="bg-base-200 rounded-lg p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider opacity-50 mb-1">Sealed Bids</p>
                    <p className="font-mono font-bold text-lg">{bidderCount}</p>
                  </div>
                  <div className="bg-base-200 rounded-lg p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider opacity-50 mb-1">Status</p>
                    <p className="font-bold text-lg">
                      {auction.claimed ? "Claimed" : auction.cancelled ? "Cancelled" : "Active"}
                    </p>
                  </div>
                </div>

                {/* Winner info (nullifier-based) */}
                {hasWinner && (
                  <div className="mt-4 p-4 bg-success/10 border border-success/30 rounded-lg">
                    <p className="text-sm font-bold text-success mb-1">Winner Declared</p>
                    <p className="font-mono text-xs break-all">Nullifier: {auction.winningNullifier}</p>
                    <p className="text-xs opacity-60 mt-1">
                      {auction.claimed ? "Tokens claimed via ZK proof" : "Winner can claim tokens with ZK proof"}
                    </p>
                  </div>
                )}

                {/* Cancelled info */}
                {currentPhase === AuctionPhase.CANCELLED && (
                  <div className="mt-4 p-4 bg-error/10 border border-error/30 rounded-lg">
                    <p className="text-sm font-bold text-error">
                      This auction has been cancelled. Tokens were refunded to the seller.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Backend Deposit Status */}
            {depositSummary && depositSummary.total > 0 && (
              <div className="card bg-base-100 shadow-xl border border-base-300">
                <div className="card-body">
                  <h2 className="card-title text-lg font-bold">ETH Deposits (BitGo)</h2>
                  <div className="grid grid-cols-3 gap-4 mt-2">
                    <div className="bg-base-200 rounded-lg p-3 text-center">
                      <p className="text-[10px] font-bold uppercase tracking-wider opacity-50 mb-1">Total</p>
                      <p className="font-mono font-bold text-lg">{depositSummary.total}</p>
                    </div>
                    <div className="bg-base-200 rounded-lg p-3 text-center">
                      <p className="text-[10px] font-bold uppercase tracking-wider opacity-50 mb-1">Committed</p>
                      <p className="font-mono font-bold text-lg">{depositSummary.committed}</p>
                    </div>
                    <div className="bg-base-200 rounded-lg p-3 text-center">
                      <p className="text-[10px] font-bold uppercase tracking-wider opacity-50 mb-1">Confirmed</p>
                      <p className="font-mono font-bold text-lg">{depositSummary.confirmed}</p>
                    </div>
                  </div>
                  <p className="text-xs opacity-50 mt-2">Bidder identities are hidden to preserve privacy.</p>
                </div>
              </div>
            )}
          </div>

          {/* ===== RIGHT COLUMN: Actions ===== */}
          <div className="space-y-6">
            {/* --- COMMIT PHASE ACTIONS --- */}
            {currentPhase === AuctionPhase.COMMIT && isConnected && !isSeller && (
              <div className="card bg-base-100 shadow-xl border border-base-300">
                <div className="card-body">
                  <h2 className="card-title text-lg font-bold">Place Your Bid</h2>

                  {depositAddress ? (
                    <div className="space-y-4">
                      {ethSent ? (
                        <div className="alert alert-success">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={2}
                            stroke="currentColor"
                            className="w-5 h-5"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                          <span className="text-sm font-bold">Bid placed and ETH sent!</span>
                        </div>
                      ) : (
                        <div className="alert alert-warning">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={2}
                            stroke="currentColor"
                            className="w-5 h-5"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                            />
                          </svg>
                          <span className="text-sm font-bold">
                            Bid registered, but ETH was not sent. Send manually below.
                          </span>
                        </div>
                      )}

                      {ethTxHash && (
                        <div className="bg-base-200 p-3 rounded-lg">
                          <p className="text-xs opacity-60 mb-1">ETH Transfer Tx:</p>
                          <p className="font-mono text-xs break-all">{ethTxHash}</p>
                        </div>
                      )}

                      {!ethSent && (
                        <div className="space-y-2">
                          <p className="text-xs opacity-60">Send {bidAmount} ETH to this deposit address:</p>
                          <div className="bg-base-200 p-3 rounded-lg break-all font-mono text-xs">{depositAddress}</div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(depositAddress);
                                notification.success("Copied!");
                              }}
                              className="btn btn-ghost btn-sm flex-1"
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
                              className="btn btn-primary btn-sm flex-1"
                            >
                              {bidLoading ? (
                                <span className="loading loading-spinner loading-sm" />
                              ) : (
                                `Send ${bidAmount} ETH`
                              )}
                            </button>
                          </div>
                        </div>
                      )}

                      <p className="text-xs opacity-50">
                        Your bid has been sealed with a ZK commitment. Your identity and bid amount are fully private --
                        they never appear on-chain.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="form-control">
                        <label className="label">
                          <span className="label-text font-bold text-sm">Bid Amount (ETH)</span>
                          <span className="label-text-alt text-xs opacity-50">
                            Min: {formatEther(auction.minimumBid)} ETH
                          </span>
                        </label>
                        <input
                          type="number"
                          value={bidAmount}
                          onChange={e => setBidAmount(e.target.value)}
                          placeholder={formatEther(auction.minimumBid)}
                          min="0"
                          step="any"
                          className="input input-bordered w-full"
                        />
                      </div>

                      <button
                        onClick={handlePlaceBid}
                        disabled={bidLoading || !bidAmount}
                        className="btn btn-primary w-full font-bold"
                      >
                        {bidLoading ? (
                          <span className="flex items-center gap-2">
                            <span className="loading loading-spinner loading-sm" />
                            {bidStep === "registering" ? "Registering bid..." : "Confirm in wallet..."}
                          </span>
                        ) : (
                          "Place Sealed Bid"
                        )}
                      </button>

                      <div className="alert alert-info text-xs">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2}
                          stroke="currentColor"
                          className="w-4 h-4 shrink-0"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
                          />
                        </svg>
                        <span>
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
              <div className="card bg-base-100 shadow-xl border border-base-300">
                <div className="card-body">
                  <h2 className="card-title text-lg font-bold">Settlement</h2>
                  <p className="text-sm opacity-70">
                    The commit phase has ended. The backend will determine the highest bid off-chain and declare the
                    winner on-chain using only their nullifier.
                  </p>
                  <button
                    onClick={handleSettle}
                    disabled={settleLoading}
                    className="btn btn-success w-full font-bold mt-2"
                  >
                    {settleLoading ? (
                      <span className="flex items-center gap-2">
                        <span className="loading loading-spinner loading-sm" />
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
              <div className="card bg-base-100 shadow-xl border border-base-300">
                <div className="card-body">
                  <h2 className="card-title text-lg font-bold">Claim with ZK Proof</h2>
                  <p className="text-sm opacity-70">
                    If you are the winner, claim your tokens by generating a ZK proof that you know the secret behind
                    the winning nullifier.
                  </p>
                  <button
                    onClick={handleClaim}
                    disabled={claimLoading || !isConnected}
                    className="btn btn-primary w-full font-bold mt-2"
                  >
                    {claimLoading ? (
                      <span className="flex items-center gap-2">
                        <span className="loading loading-spinner loading-sm" />
                        Generating proof...
                      </span>
                    ) : (
                      "Claim with ZK Proof"
                    )}
                  </button>
                  <p className="text-xs opacity-50 mt-2">
                    The proof is generated server-side and submitted from a burner wallet. Your real identity is never
                    revealed.
                  </p>
                </div>
              </div>
            )}

            {/* --- CLAIMED SUCCESS --- */}
            {auction.claimed && (
              <div className="card bg-success/10 border border-success/30 shadow-xl">
                <div className="card-body">
                  <h2 className="card-title text-lg font-bold text-success">Claimed</h2>
                  <p className="text-sm opacity-70">
                    This auction has been settled and tokens claimed via ZK proof. Check your{" "}
                    <Link href="/profile" className="link link-primary font-bold">
                      profile
                    </Link>{" "}
                    for stealth announcements.
                  </p>
                </div>
              </div>
            )}

            {/* --- SELLER CANCEL ACTION --- */}
            {isSeller && !auction.claimed && !auction.cancelled && (
              <div className="card bg-base-100 shadow-xl border border-base-300">
                <div className="card-body">
                  <h2 className="card-title text-lg font-bold">Seller Actions</h2>
                  <button onClick={handleCancel} className="btn btn-error btn-outline w-full font-bold">
                    Cancel Auction
                  </button>
                  <p className="text-xs opacity-50 mt-2">
                    Cancelling will refund all tokens back to you. This cannot be undone.
                  </p>
                </div>
              </div>
            )}

            {/* --- NOT CONNECTED --- */}
            {!isConnected && (
              <div className="card bg-base-100 shadow-xl border border-base-300">
                <div className="card-body items-center text-center">
                  <h2 className="card-title text-lg font-bold">Connect Wallet</h2>
                  <p className="text-sm opacity-60">Connect your wallet to place bids or manage this auction.</p>
                </div>
              </div>
            )}

            {/* --- INFO CARD --- */}
            <div className="card bg-base-200 border border-base-300">
              <div className="card-body">
                <h3 className="font-bold text-sm">How ZK Sealed-Bid Auctions Work</h3>
                <ul className="text-xs opacity-70 space-y-1.5 mt-2 list-disc list-inside">
                  <li>
                    <strong>Commit:</strong> Submit a sealed bid (amount + identity hidden via ZK nullifier)
                  </li>
                  <li>
                    <strong>Deposit:</strong> Send ETH to your unique BitGo deposit address
                  </li>
                  <li>
                    <strong>Settlement:</strong> Backend reveals bids off-chain, declares winner by nullifier
                  </li>
                  <li>
                    <strong>Claim:</strong> Winner proves knowledge of secret via ZK proof
                  </li>
                  <li>
                    <strong>Refunds:</strong> Non-winners get ETH refunded automatically
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuctionDetail;
