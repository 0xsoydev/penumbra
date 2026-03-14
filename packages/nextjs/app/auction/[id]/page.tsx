"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Address } from "@scaffold-ui/components";
import type { NextPage } from "next";
import { encodePacked, formatEther, keccak256, parseEther } from "viem";
import { useAccount } from "wagmi";
import { CountdownTimer } from "~~/components/penumbra/CountdownTimer";
import { PhaseIndicator } from "~~/components/penumbra/PhaseIndicator";
import { useBidStorage } from "~~/hooks/penumbra/useBidStorage";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { AuctionData, AuctionPhase, AuctionStatusResponse, ZERO_ADDRESS } from "~~/types/auction";
import { notification } from "~~/utils/scaffold-eth";

const AuctionDetail: NextPage = () => {
  const params = useParams();
  const auctionId = Number(params.id);
  const { address, isConnected } = useAccount();
  const { getBid, saveBid, markRevealed } = useBidStorage();

  // --- State ---
  const [bidAmount, setBidAmount] = useState("");
  const [depositAddress, setDepositAddress] = useState<string | null>(null);
  const [depositLoading, setDepositLoading] = useState(false);
  const [backendStatus, setBackendStatus] = useState<AuctionStatusResponse | null>(null);
  const [settleLoading, setSettleLoading] = useState(false);

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

  const { data: bidders } = useScaffoldReadContract({
    contractName: "PenumbraAuction",
    functionName: "getAuctionBidders",
    args: [BigInt(auctionId)],
  });

  const { data: myCommit } = useScaffoldReadContract({
    contractName: "PenumbraAuction",
    functionName: "getCommit",
    args: [BigInt(auctionId), address],
  });

  // --- Write hooks ---
  const { writeContractAsync: writeCommit, isPending: isCommitPending } = useScaffoldWriteContract({
    contractName: "PenumbraAuction",
  });

  const { writeContractAsync: writeReveal, isPending: isRevealPending } = useScaffoldWriteContract({
    contractName: "PenumbraAuction",
  });

  const { writeContractAsync: writeCancel, isPending: isCancelPending } = useScaffoldWriteContract({
    contractName: "PenumbraAuction",
  });

  // --- Derived data ---
  const auction: AuctionData | null = auctionData
    ? {
        seller: (auctionData as unknown as AuctionData).seller,
        tokenAddress: (auctionData as unknown as AuctionData).tokenAddress,
        tokenAmount: (auctionData as unknown as AuctionData).tokenAmount,
        minimumBid: (auctionData as unknown as AuctionData).minimumBid,
        commitDeadline: (auctionData as unknown as AuctionData).commitDeadline,
        revealDeadline: (auctionData as unknown as AuctionData).revealDeadline,
        winner: (auctionData as unknown as AuctionData).winner,
        winningBid: (auctionData as unknown as AuctionData).winningBid,
        winnerStealthAddress: (auctionData as unknown as AuctionData).winnerStealthAddress,
        settled: (auctionData as unknown as AuctionData).settled,
        cancelled: (auctionData as unknown as AuctionData).cancelled,
      }
    : null;

  const currentPhase = phase as AuctionPhase | undefined;
  const bidderList = bidders as readonly string[] | undefined;
  const bidderCount = bidderList?.length ?? 0;
  const storedBid = getBid(auctionId);

  const commitObj = myCommit as unknown as
    | { commitHash: string; revealed: boolean; revealedAmount: bigint }
    | undefined;
  const isSeller = auction && address && auction.seller.toLowerCase() === address.toLowerCase();
  const hasCommitted =
    commitObj && commitObj.commitHash !== "0x0000000000000000000000000000000000000000000000000000000000000000";
  const hasRevealed = commitObj && commitObj.revealed;
  const isWinner = auction && address && auction.winner.toLowerCase() === address.toLowerCase();

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

  // --- Commit Bid ---
  const handleCommitBid = async () => {
    if (!bidAmount || !address) return;

    const bidWei = parseEther(bidAmount);
    const salt = keccak256(
      encodePacked(["address", "uint256", "uint256"], [address, BigInt(auctionId), BigInt(Date.now())]),
    );
    const commitHash = keccak256(encodePacked(["uint256", "bytes32"], [bidWei, salt]));

    try {
      await writeCommit({
        functionName: "commitBid",
        args: [BigInt(auctionId), commitHash],
      });

      // Save bid data locally
      saveBid({
        auctionId,
        bidAmount: bidWei.toString(),
        salt,
        committed: true,
        revealed: false,
      });

      notification.success("Bid committed! Remember to reveal during the reveal phase.");
      refetchAuction();
    } catch (e: unknown) {
      console.error("Commit error:", e);
      notification.error("Failed to commit bid");
    }
  };

  // --- Request Deposit Address ---
  const handleGetDepositAddress = async () => {
    if (!address) return;
    setDepositLoading(true);
    try {
      const res = await fetch(`/api/auction/${auctionId}/deposit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bidderAddress: address.toLowerCase() }),
      });

      if (res.ok) {
        const data = await res.json();
        setDepositAddress(data.depositAddress);
        notification.success("Deposit address generated!");
      } else {
        const err = await res.json();
        notification.error(err.error || "Failed to get deposit address");
      }
    } catch (e) {
      console.error("Deposit address error:", e);
      notification.error("Failed to get deposit address");
    } finally {
      setDepositLoading(false);
    }
  };

  // --- Reveal Bid ---
  const handleRevealBid = async () => {
    if (!storedBid) {
      notification.error("No stored bid data found! You need the original bid amount and salt to reveal.");
      return;
    }

    try {
      await writeReveal({
        functionName: "revealBid",
        args: [BigInt(auctionId), BigInt(storedBid.bidAmount), storedBid.salt as `0x${string}`],
      });

      markRevealed(auctionId);
      notification.success("Bid revealed successfully!");
      refetchAuction();
    } catch (e: unknown) {
      console.error("Reveal error:", e);
      notification.error("Failed to reveal bid");
    }
  };

  // --- Cancel Auction ---
  const handleCancel = async () => {
    try {
      await writeCancel({
        functionName: "cancelAuction",
        args: [BigInt(auctionId)],
      });
      notification.success("Auction cancelled. Tokens refunded.");
      refetchAuction();
      refetchPhase();
    } catch (e: unknown) {
      console.error("Cancel error:", e);
      notification.error("Failed to cancel auction");
    }
  };

  // --- Trigger Settlement ---
  const handleSettle = async () => {
    setSettleLoading(true);
    try {
      const res = await fetch(`/api/auction/${auctionId}/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (res.ok) {
        const data = await res.json();
        notification.success(`Settlement complete! Winner: ${data.settlement.winner}`);
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

  // --- Loading ---
  if (!auction || currentPhase === undefined) {
    return (
      <div className="flex justify-center items-center flex-1 py-20">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  // --- My deposit info ---
  const myDeposit = backendStatus?.deposits.find(
    d => address && d.bidderAddress.toLowerCase() === address.toLowerCase(),
  );

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
            {(currentPhase === AuctionPhase.COMMIT || currentPhase === AuctionPhase.REVEAL) && (
              <>
                <CountdownTimer deadline={auction.commitDeadline} label="Commit Deadline" />
                <CountdownTimer deadline={auction.revealDeadline} label="Reveal Deadline" />
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
                    <p className="text-[10px] font-bold uppercase tracking-wider opacity-50 mb-1">Bidders</p>
                    <p className="font-mono font-bold text-lg">{bidderCount}</p>
                  </div>
                  <div className="bg-base-200 rounded-lg p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider opacity-50 mb-1">Status</p>
                    <p className="font-bold text-lg">
                      {auction.settled ? "Settled" : auction.cancelled ? "Cancelled" : "Active"}
                    </p>
                  </div>
                </div>

                {/* Winner info */}
                {currentPhase === AuctionPhase.ENDED && auction.winner !== ZERO_ADDRESS && (
                  <div className="mt-4 p-4 bg-success/10 border border-success/30 rounded-lg">
                    <p className="text-sm font-bold text-success mb-1">Winner</p>
                    <Address address={auction.winner} size="sm" />
                    <p className="font-mono font-bold mt-2">Winning Bid: {formatEther(auction.winningBid)} ETH</p>
                    {isWinner && <div className="badge badge-success mt-2">You won!</div>}
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

            {/* Bidder List (visible in reveal/ended phases) */}
            {(currentPhase === AuctionPhase.REVEAL || currentPhase === AuctionPhase.ENDED) &&
              bidderList &&
              bidderList.length > 0 && (
                <div className="card bg-base-100 shadow-xl border border-base-300">
                  <div className="card-body">
                    <h2 className="card-title text-lg font-bold">Bidders ({bidderCount})</h2>
                    <div className="overflow-x-auto mt-2">
                      <table className="table table-sm">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Address</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bidderList.map((bidder, i) => (
                            <BidderRow
                              key={bidder}
                              index={i}
                              bidder={bidder}
                              auctionId={auctionId}
                              userAddress={address}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

            {/* Backend Deposit Status */}
            {backendStatus && backendStatus.deposits.length > 0 && (
              <div className="card bg-base-100 shadow-xl border border-base-300">
                <div className="card-body">
                  <h2 className="card-title text-lg font-bold">ETH Deposits (BitGo)</h2>
                  <div className="overflow-x-auto mt-2">
                    <table className="table table-sm">
                      <thead>
                        <tr>
                          <th>Bidder</th>
                          <th>Amount (Wei)</th>
                          <th>Confirmed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {backendStatus.deposits.map((dep, i) => (
                          <tr key={i}>
                            <td className="font-mono text-xs">
                              {dep.bidderAddress.slice(0, 8)}...{dep.bidderAddress.slice(-6)}
                            </td>
                            <td className="font-mono text-xs">{dep.amountWei === "0" ? "Pending" : dep.amountWei}</td>
                            <td>
                              {dep.confirmed ? (
                                <span className="badge badge-success badge-sm">Confirmed</span>
                              ) : (
                                <span className="badge badge-warning badge-sm">Pending</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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

                  {hasCommitted ? (
                    <div className="space-y-4">
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
                        <span className="text-sm font-bold">Bid committed!</span>
                      </div>
                      <p className="text-xs opacity-60">
                        Your bid is sealed. You must reveal it during the reveal phase.
                        {storedBid && (
                          <span className="block mt-1 text-success">
                            Bid data saved locally ({formatEther(BigInt(storedBid.bidAmount))} ETH).
                          </span>
                        )}
                      </p>

                      {/* Deposit section */}
                      <div className="divider text-xs">ETH Deposit</div>
                      {depositAddress ? (
                        <div className="space-y-2">
                          <p className="text-xs opacity-60">Send your bid amount in ETH to:</p>
                          <div className="bg-base-200 p-3 rounded-lg break-all font-mono text-xs">{depositAddress}</div>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(depositAddress);
                              notification.success("Copied!");
                            }}
                            className="btn btn-ghost btn-sm w-full"
                          >
                            Copy Address
                          </button>
                          {myDeposit && (
                            <div className="mt-2">
                              {myDeposit.confirmed ? (
                                <div className="badge badge-success w-full py-3">Deposit Confirmed</div>
                              ) : (
                                <div className="badge badge-warning w-full py-3">Awaiting Deposit...</div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={handleGetDepositAddress}
                          disabled={depositLoading}
                          className="btn btn-secondary btn-sm w-full"
                        >
                          {depositLoading ? (
                            <span className="loading loading-spinner loading-xs" />
                          ) : (
                            "Get Deposit Address"
                          )}
                        </button>
                      )}
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
                        onClick={handleCommitBid}
                        disabled={isCommitPending || !bidAmount || parseEther(bidAmount || "0") < auction.minimumBid}
                        className="btn btn-primary w-full font-bold"
                      >
                        {isCommitPending ? <span className="loading loading-spinner loading-sm" /> : "Commit Bid"}
                      </button>

                      <div className="alert alert-warning text-xs">
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
                            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                          />
                        </svg>
                        <span>
                          Your bid is sealed with a hash. You MUST reveal it during the reveal phase or your bid is
                          forfeited.
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* --- REVEAL PHASE ACTIONS --- */}
            {currentPhase === AuctionPhase.REVEAL && isConnected && !isSeller && hasCommitted && (
              <div className="card bg-base-100 shadow-xl border border-base-300">
                <div className="card-body">
                  <h2 className="card-title text-lg font-bold">Reveal Your Bid</h2>

                  {hasRevealed ? (
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
                      <span className="text-sm font-bold">Bid revealed! Waiting for reveal phase to end.</span>
                    </div>
                  ) : storedBid ? (
                    <div className="space-y-4">
                      <div className="bg-base-200 p-3 rounded-lg">
                        <p className="text-xs opacity-60 mb-1">Your sealed bid:</p>
                        <p className="font-mono font-bold">{formatEther(BigInt(storedBid.bidAmount))} ETH</p>
                      </div>

                      <button
                        onClick={handleRevealBid}
                        disabled={isRevealPending}
                        className="btn btn-warning w-full font-bold"
                      >
                        {isRevealPending ? <span className="loading loading-spinner loading-sm" /> : "Reveal Bid"}
                      </button>
                    </div>
                  ) : (
                    <div className="alert alert-error">
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
                          d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
                        />
                      </svg>
                      <span className="text-sm">
                        Bid data not found in local storage. Your bid cannot be revealed and is forfeited.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* --- ENDED PHASE ACTIONS (Settle) --- */}
            {currentPhase === AuctionPhase.ENDED && !auction.settled && !auction.cancelled && (
              <div className="card bg-base-100 shadow-xl border border-base-300">
                <div className="card-body">
                  <h2 className="card-title text-lg font-bold">Settlement</h2>
                  {auction.winner !== ZERO_ADDRESS ? (
                    <div className="space-y-4">
                      <p className="text-sm opacity-70">
                        The auction has ended. Trigger settlement to transfer tokens to the winner via stealth address
                        and process ETH payments.
                      </p>
                      <button
                        onClick={handleSettle}
                        disabled={settleLoading}
                        className="btn btn-success w-full font-bold"
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
                  ) : (
                    <div className="alert alert-warning">
                      <span className="text-sm">
                        No bids were revealed. The seller can cancel the auction to reclaim tokens.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* --- SETTLED SUCCESS --- */}
            {auction.settled && (
              <div className="card bg-success/10 border border-success/30 shadow-xl">
                <div className="card-body">
                  <h2 className="card-title text-lg font-bold text-success">Settled</h2>
                  <p className="text-sm opacity-70">
                    This auction has been settled. Tokens have been transferred to the winner&apos;s stealth address.
                    Check your{" "}
                    <Link href="/profile" className="link link-primary font-bold">
                      profile
                    </Link>{" "}
                    for stealth announcements.
                  </p>
                </div>
              </div>
            )}

            {/* --- SELLER CANCEL ACTION --- */}
            {isSeller && !auction.settled && !auction.cancelled && (
              <div className="card bg-base-100 shadow-xl border border-base-300">
                <div className="card-body">
                  <h2 className="card-title text-lg font-bold">Seller Actions</h2>
                  <button
                    onClick={handleCancel}
                    disabled={isCancelPending}
                    className="btn btn-error btn-outline w-full font-bold"
                  >
                    {isCancelPending ? <span className="loading loading-spinner loading-sm" /> : "Cancel Auction"}
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
                <h3 className="font-bold text-sm">How Sealed-Bid Auctions Work</h3>
                <ul className="text-xs opacity-70 space-y-1.5 mt-2 list-disc list-inside">
                  <li>
                    <strong>Commit:</strong> Submit a hashed bid (amount is hidden)
                  </li>
                  <li>
                    <strong>Deposit:</strong> Send ETH to your unique deposit address
                  </li>
                  <li>
                    <strong>Reveal:</strong> Reveal your actual bid amount
                  </li>
                  <li>
                    <strong>Settlement:</strong> Winner receives tokens via stealth address
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

// Sub-component to display individual bidder row with their commit data
const BidderRow = ({
  index,
  bidder,
  auctionId,
  userAddress,
}: {
  index: number;
  bidder: string;
  auctionId: number;
  userAddress: string | undefined;
}) => {
  const { data: commit } = useScaffoldReadContract({
    contractName: "PenumbraAuction",
    functionName: "getCommit",
    args: [BigInt(auctionId), bidder],
  });

  const commitData = commit as unknown as { commitHash: string; revealed: boolean; revealedAmount: bigint } | undefined;
  const revealed = commitData?.revealed;
  const revealedAmount = commitData?.revealedAmount;
  const isUser = userAddress && bidder.toLowerCase() === userAddress.toLowerCase();

  return (
    <tr className={isUser ? "bg-primary/10" : ""}>
      <td>{index + 1}</td>
      <td>
        <div className="flex items-center gap-2">
          <Address address={bidder} size="xs" />
          {isUser && <span className="badge badge-primary badge-xs">You</span>}
        </div>
      </td>
      <td>
        {revealed ? (
          <span className="font-mono text-sm font-bold text-success">{formatEther(revealedAmount ?? 0n)} ETH</span>
        ) : (
          <span className="badge badge-ghost badge-sm">Hidden</span>
        )}
      </td>
    </tr>
  );
};

export default AuctionDetail;
