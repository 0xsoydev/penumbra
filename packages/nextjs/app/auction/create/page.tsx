"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { NextPage } from "next";
import { parseEther } from "viem";
import { useAccount } from "wagmi";
import { useDeployedContractInfo, useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

const PENUMBRA_TOKEN_ADDRESS = "0x5dfbd7e43d207f3c1c67e5d81a28593bec0981e7";

const CreateAuction: NextPage = () => {
  const router = useRouter();
  const { address, isConnected } = useAccount();

  const [tokenAddress, setTokenAddress] = useState(PENUMBRA_TOKEN_ADDRESS);
  const [tokenAmount, setTokenAmount] = useState("");
  const [minimumBid, setMinimumBid] = useState("");
  const [commitMinutes, setCommitMinutes] = useState("10");
  const [settleMinutes, setSettleMinutes] = useState("10");
  const [ensName, setEnsName] = useState("");
  const [docCid, setDocCid] = useState("");

  // Get the deployed PenumbraAuction address dynamically
  const { data: auctionContractData } = useDeployedContractInfo({ contractName: "PenumbraAuction" });
  const auctionAddress = auctionContractData?.address;

  const [step, setStep] = useState<"form" | "approving" | "creating" | "registering" | "done">("form");
  const [createdAuctionId, setCreatedAuctionId] = useState<number | null>(null);

  // Check token balance
  const { data: tokenBalance } = useScaffoldReadContract({
    contractName: "PenumbraToken",
    functionName: "balanceOf",
    args: [address],
  });

  // Check allowance
  const { data: allowance } = useScaffoldReadContract({
    contractName: "PenumbraToken",
    functionName: "allowance",
    args: [address, auctionAddress],
  });

  // Write hooks
  const { writeContractAsync: writeToken, isPending: isApprovePending } = useScaffoldWriteContract({
    contractName: "PenumbraToken",
  });

  const { writeContractAsync: writeAuction, isPending: isCreatePending } = useScaffoldWriteContract({
    contractName: "PenumbraAuction",
  });

  // Read nextAuctionId to know what ID will be assigned
  const { data: nextAuctionId } = useScaffoldReadContract({
    contractName: "PenumbraAuction",
    functionName: "nextAuctionId",
  });

  const tokenAmountWei = tokenAmount ? parseEther(tokenAmount) : 0n;
  const needsApproval = allowance !== undefined && tokenAmountWei > 0n && allowance < tokenAmountWei;
  const hasEnoughBalance = tokenBalance !== undefined && tokenAmountWei > 0n && tokenBalance >= tokenAmountWei;

  const handleApprove = async () => {
    if (!tokenAmount || !auctionAddress) return;
    setStep("approving");
    try {
      await writeToken({
        functionName: "approve",
        args: [auctionAddress, tokenAmountWei],
      });
      notification.success("Token approval successful!");
      setStep("form");
    } catch (e: unknown) {
      console.error("Approve error:", e);
      notification.error("Approval failed");
      setStep("form");
    }
  };

  const handleCreate = async () => {
    if (!tokenAmount || !minimumBid || !commitMinutes || !settleMinutes) {
      notification.error("Please fill all required fields");
      return;
    }

    const commitDuration = BigInt(Number(commitMinutes) * 60);
    const settleDuration = BigInt(Number(settleMinutes) * 60);
    const minimumBidWei = parseEther(minimumBid);
    const auctionId = nextAuctionId !== undefined ? Number(nextAuctionId) : null;

    setStep("creating");
    try {
      await writeAuction({
        functionName: "createAuction",
        args: [tokenAddress, tokenAmountWei, minimumBidWei, commitDuration, settleDuration],
      });

      notification.success("Auction created on-chain!");

      // Register auction in backend
      if (auctionId !== null) {
        setStep("registering");
        try {
          const res = await fetch("/api/auction/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              auctionId,
              sellerAddress: address?.toLowerCase(),
              ensName: ensName || undefined,
              docCid: docCid || undefined,
            }),
          });

          if (!res.ok) {
            const err = await res.json();
            console.error("Backend registration failed:", err);
            notification.warning("On-chain auction created but backend registration failed. Auction still works.");
          } else {
            notification.success("Auction registered with BitGo wallet!");
          }
        } catch (e) {
          console.error("Backend error:", e);
          notification.warning("On-chain auction created but backend registration failed.");
        }

        setCreatedAuctionId(auctionId);
        setStep("done");
      } else {
        setStep("done");
      }
    } catch (e: unknown) {
      console.error("Create auction error:", e);
      notification.error("Auction creation failed");
      setStep("form");
    }
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 py-20 px-4 bg-[#E5E5E5] min-h-screen">
        <div className="bg-white border-4 border-black shadow-[8px_8px_0px_#0066FF] p-12 flex flex-col items-center max-w-md text-center">
          <div className="text-6xl mb-6 text-black">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-24 h-24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3"
              />
            </svg>
          </div>
          <h2 className="text-3xl font-winky font-normal tracking-wide mb-4 text-black uppercase">Connect Wallet</h2>
          <p className="text-base font-bold text-black border-2 border-black px-4 py-2 bg-[#E5E5E5] shadow-[2px_2px_0px_#000]">
            You need to connect a wallet to create an auction.
          </p>
        </div>
      </div>
    );
  }

  if (step === "done" && createdAuctionId !== null) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 py-20 px-4 bg-[#E5E5E5] min-h-screen">
        <div className="bg-white border-4 border-black shadow-[8px_8px_0px_#0066FF] p-12 flex flex-col items-center max-w-lg text-center">
          <div className="text-6xl mb-6 text-[#0066FF]">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={3}
              stroke="currentColor"
              className="w-24 h-24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
          </div>
          <h2 className="text-4xl font-winky font-normal tracking-wide mb-4 text-black uppercase">Auction Created!</h2>
          <p className="text-xl font-bold mb-8 text-black bg-[#E5E5E5] border-2 border-black px-6 py-2 shadow-[2px_2px_0px_#000]">
            Auction #{createdAuctionId} is now live.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <button
              onClick={() => router.push(`/auction/${createdAuctionId}`)}
              className="btn bg-[#0066FF] text-white border-2 border-black hover:bg-[#0055DD] rounded-none px-8 text-lg font-black shadow-[4px_4px_0px_#000000] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[2px_2px_0px_#000000] transition-all"
            >
              View Auction
            </button>
            <button
              onClick={() => {
                setStep("form");
                setCreatedAuctionId(null);
                setTokenAmount("");
                setMinimumBid("");
              }}
              className="btn bg-white text-black border-2 border-black hover:bg-[#E5E5E5] rounded-none px-8 text-lg font-black shadow-[4px_4px_0px_#000000] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[2px_2px_0px_#000000] transition-all"
            >
              Create Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  const getStepClass = (stepName: string) => {
    const activeClasses = "bg-[#0066FF] text-white shadow-[2px_2px_0px_#000] border-black";
    const inactiveClasses = "bg-white text-black border-black opacity-50";

    if (stepName === "Configure" && step === "form") return activeClasses;
    if (stepName === "Approve" && step === "approving") return activeClasses;
    if (stepName === "Create" && (step === "creating" || step === "registering")) return activeClasses;
    if (stepName === "Done" && step === "done") return activeClasses;

    return inactiveClasses;
  };

  return (
    <div className="flex-1 py-12 px-4 sm:px-6 bg-[#E5E5E5] min-h-screen">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="font-winky text-5xl md:text-6xl font-normal tracking-wide mb-4 text-black uppercase">
            Create Auction
          </h1>
          <p className="text-lg font-bold text-black bg-white border-2 border-black px-6 py-2 inline-block shadow-[4px_4px_0px_#0066FF]">
            List your ERC-20 tokens for a sealed-bid auction.
          </p>
        </div>

        {/* Brutalist Progress Indicator */}
        <div className="flex flex-wrap gap-2 mb-8">
          {["Configure", "Approve", "Create", "Done"].map((s, i) => (
            <div
              key={s}
              className={`flex-1 text-center font-black py-2 border-2 transition-all text-sm md:text-base ${getStepClass(s)}`}
            >
              {i + 1}. {s}
            </div>
          ))}
        </div>

        {/* Form Card */}
        <div className="bg-white border-4 border-black shadow-[8px_8px_0px_#0066FF] p-6 md:p-10 relative">
          {/* Decorative corner accent */}
          <div className="absolute -top-4 -right-4 w-8 h-8 bg-[#E60000] border-2 border-black shadow-[2px_2px_0px_#000] z-10 transform rotate-12"></div>

          <div className="flex flex-col gap-6">
            {/* Token Address */}
            <div className="form-control">
              <label className="label px-0 pt-0">
                <span className="label-text font-fira font-bold text-lg text-black uppercase">Token Address</span>
              </label>
              <input
                type="text"
                value={tokenAddress}
                onChange={e => setTokenAddress(e.target.value)}
                placeholder="0x..."
                className="input bg-white border-2 border-black rounded-none focus:outline-none focus:ring-0 focus:border-[#0066FF] focus:shadow-[4px_4px_0px_#0066FF] text-black font-fira text-sm w-full transition-all"
              />
              <label className="label px-0 pb-0">
                <span className="label-text-alt font-bold text-black/60">Default: PenumbraToken (PNBR)</span>
              </label>
            </div>

            {/* Token Amount */}
            <div className="form-control">
              <label className="label px-0 pt-0">
                <span className="label-text font-fira font-bold text-lg text-black uppercase">Token Amount</span>
                {tokenBalance !== undefined && (
                  <span className="label-text-alt font-bold bg-[#E5E5E5] border border-black px-2 py-1 text-black">
                    Balance: {(Number(tokenBalance) / 1e18).toFixed(2)} PNBR
                  </span>
                )}
              </label>
              <input
                type="number"
                value={tokenAmount}
                onChange={e => setTokenAmount(e.target.value)}
                placeholder="100"
                min="0"
                step="any"
                className="input bg-white border-2 border-black rounded-none focus:outline-none focus:ring-0 focus:border-[#0066FF] focus:shadow-[4px_4px_0px_#0066FF] text-black font-bold text-lg w-full transition-all"
              />
              {tokenAmount && !hasEnoughBalance && (
                <label className="label px-0 pb-0">
                  <span className="label-text-alt font-bold text-[#E60000]">Insufficient token balance</span>
                </label>
              )}
            </div>

            {/* Minimum Bid */}
            <div className="form-control">
              <label className="label px-0 pt-0">
                <span className="label-text font-fira font-bold text-lg text-black uppercase">Minimum Bid (ETH)</span>
              </label>
              <input
                type="number"
                value={minimumBid}
                onChange={e => setMinimumBid(e.target.value)}
                placeholder="0.01"
                min="0"
                step="any"
                className="input bg-white border-2 border-black rounded-none focus:outline-none focus:ring-0 focus:border-[#0066FF] focus:shadow-[4px_4px_0px_#0066FF] text-black font-bold text-lg w-full transition-all"
              />
            </div>

            {/* Durations */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="form-control">
                <label className="label px-0 pt-0">
                  <span className="label-text font-black text-lg text-black uppercase">Commit (min)</span>
                </label>
                <input
                  type="number"
                  value={commitMinutes}
                  onChange={e => setCommitMinutes(e.target.value)}
                  placeholder="10"
                  min="1"
                  className="input bg-white border-2 border-black rounded-none focus:outline-none focus:ring-0 focus:border-[#0066FF] focus:shadow-[4px_4px_0px_#0066FF] text-black font-bold text-lg w-full transition-all"
                />
              </div>
              <div className="form-control">
                <label className="label px-0 pt-0">
                  <span className="label-text font-black text-lg text-black uppercase">Settle (min)</span>
                </label>
                <input
                  type="number"
                  value={settleMinutes}
                  onChange={e => setSettleMinutes(e.target.value)}
                  placeholder="10"
                  min="1"
                  className="input bg-white border-2 border-black rounded-none focus:outline-none focus:ring-0 focus:border-[#0066FF] focus:shadow-[4px_4px_0px_#0066FF] text-black font-bold text-lg w-full transition-all"
                />
              </div>
            </div>

            {/* Optional fields - Brutalist Accordion Style */}
            <div className="mt-4 border-2 border-black bg-[#E5E5E5]">
              <details className="group">
                <summary className="font-black text-lg text-black p-4 cursor-pointer list-none flex justify-between items-center uppercase hover:bg-[#d5d5d5] transition-colors">
                  Optional Fields
                  <span className="group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="p-4 border-t-2 border-black bg-white flex flex-col gap-4">
                  <div className="form-control">
                    <label className="label px-0 pt-0">
                      <span className="label-text font-black text-black">ENS NAME</span>
                    </label>
                    <input
                      type="text"
                      value={ensName}
                      onChange={e => setEnsName(e.target.value)}
                      placeholder="yourname.eth"
                      className="input bg-white border-2 border-black rounded-none focus:outline-none focus:ring-0 focus:border-[#0066FF] focus:shadow-[4px_4px_0px_#0066FF] text-black font-bold w-full transition-all"
                    />
                  </div>
                  <div className="form-control">
                    <label className="label px-0 pt-0">
                      <span className="label-text font-black text-black">DOCUMENT CID (IPFS)</span>
                    </label>
                    <input
                      type="text"
                      value={docCid}
                      onChange={e => setDocCid(e.target.value)}
                      placeholder="bafy..."
                      className="input bg-white border-2 border-black rounded-none focus:outline-none focus:ring-0 focus:border-[#0066FF] focus:shadow-[4px_4px_0px_#0066FF] text-black font-fira text-sm w-full transition-all"
                    />
                  </div>
                </div>
              </details>
            </div>

            {/* Action buttons */}
            <div className="mt-4">
              {needsApproval ? (
                <button
                  onClick={handleApprove}
                  disabled={isApprovePending || !tokenAmount || !hasEnoughBalance}
                  className="w-full py-4 bg-[#FFD700] text-black border-4 border-black font-black text-xl uppercase tracking-wider shadow-[6px_6px_0px_#000000] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[4px_4px_0px_#000000] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {isApprovePending ? (
                    <span className="loading loading-spinner loading-md" />
                  ) : (
                    `Approve ${tokenAmount || "0"} PNBR`
                  )}
                </button>
              ) : (
                <button
                  onClick={handleCreate}
                  disabled={
                    isCreatePending ||
                    !tokenAmount ||
                    !minimumBid ||
                    !commitMinutes ||
                    !settleMinutes ||
                    !hasEnoughBalance ||
                    step !== "form"
                  }
                  className="w-full py-4 bg-[#0066FF] text-white border-4 border-black font-black text-xl uppercase tracking-wider shadow-[6px_6px_0px_#000000] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[4px_4px_0px_#000000] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {step === "creating" || step === "registering" ? (
                    <span className="flex items-center justify-center gap-3">
                      <span className="loading loading-spinner loading-md" />
                      {step === "creating" ? "Creating on-chain..." : "Registering backend..."}
                    </span>
                  ) : (
                    "Create Auction"
                  )}
                </button>
              )}
            </div>

            {/* Info box */}
            <div className="mt-4 border-4 border-black bg-white p-4 shadow-[4px_4px_0px_#000000] relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-[#0066FF] opacity-10 rounded-bl-full"></div>
              <h3 className="font-winky font-normal tracking-wide text-black uppercase mb-2 flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={3}
                  stroke="currentColor"
                  className="w-5 h-5 text-[#0066FF]"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
                  />
                </svg>
                How it works
              </h3>
              <ul className="text-sm font-bold text-black/80 space-y-1 ml-1">
                <li>1. Approve token transfer to the auction contract</li>
                <li>2. Create the auction (tokens are locked in the contract)</li>
                <li>3. Bidders submit sealed bids privately during the commit phase</li>
                <li>4. Backend settles the auction off-chain — bid amounts are never revealed on-chain</li>
                <li>5. Winner claims tokens with a ZK proof to a stealth address</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateAuction;
