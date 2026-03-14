import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { isAddress } from "viem";
import { db } from "~~/db";
import { stealthAnnouncements, stealthKeys } from "~~/db/schema";
import { computeStealthPrivateKey, isAnnouncementForUser } from "~~/services/penumbra/umbra";

/**
 * POST /api/withdraw
 *
 * Withdraw ETH from stealth addresses to a personal wallet.
 *
 * The user provides their stealth keys (spending private key + viewing private key)
 * and a destination address. The backend:
 *   1. Scans stealth announcements to find payments directed at the user
 *   2. Derives the stealth private key for each matching address
 *   3. Sweeps ETH from each stealth address to the destination
 *
 * Body: {
 *   spendingPrivateKey: string   — user's spending private key (66-char hex)
 *   viewingPrivateKey: string    — user's viewing private key (66-char hex)
 *   destinationAddress: string   — where to send the ETH
 *   recipientAddress?: string    — (optional) filter announcements by this address
 * }
 *
 * SECURITY NOTE: Private keys are transmitted over HTTPS and used transiently.
 * In production, this should be done client-side. For hackathon demo, this
 * server-side approach is acceptable.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { spendingPrivateKey, viewingPrivateKey, destinationAddress, recipientAddress } = body;

    // --- Validation ---
    if (!spendingPrivateKey || !viewingPrivateKey || !destinationAddress) {
      return NextResponse.json(
        { error: "Missing required fields: spendingPrivateKey, viewingPrivateKey, destinationAddress" },
        { status: 400 },
      );
    }

    if (!isAddress(destinationAddress)) {
      return NextResponse.json({ error: "Invalid destinationAddress" }, { status: 400 });
    }

    // Validate key format (should be 66-char hex: 0x + 64 hex chars)
    const hexPattern = /^0x[0-9a-fA-F]{64}$/;
    if (!hexPattern.test(spendingPrivateKey)) {
      return NextResponse.json(
        { error: "Invalid spendingPrivateKey format (expected 0x + 64 hex chars)" },
        { status: 400 },
      );
    }
    if (!hexPattern.test(viewingPrivateKey)) {
      return NextResponse.json(
        { error: "Invalid viewingPrivateKey format (expected 0x + 64 hex chars)" },
        { status: 400 },
      );
    }

    // --- Look up user's public keys to find their announcements ---
    // Derive spending public key from private key to look up announcements
    const { ethers } = await import("ethers");
    const spendingWallet = new ethers.Wallet(spendingPrivateKey);
    const spendingPublicKey = spendingWallet.publicKey; // uncompressed 0x04... (not used for lookup)
    const userAddress = spendingWallet.address.toLowerCase();

    // Fetch announcements — optionally filter by recipientAddress
    const lookupAddress = recipientAddress ? recipientAddress.toLowerCase() : userAddress;

    // First check if we have stealth keys registered for this user
    const [registeredKeys] = await db.select().from(stealthKeys).where(eq(stealthKeys.address, lookupAddress));

    // Fetch all announcements for this user
    const announcements = await db
      .select()
      .from(stealthAnnouncements)
      .where(eq(stealthAnnouncements.recipientAddress, lookupAddress));

    if (announcements.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No stealth announcements found for this address",
        withdrawals: [],
        totalSwept: "0",
      });
    }

    // --- Scan and sweep ---
    const provider = new ethers.providers.JsonRpcProvider(
      process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
    );

    const withdrawals: {
      stealthAddress: string;
      auctionId: number;
      balanceWei: string;
      txHash: string | null;
      error: string | null;
    }[] = [];

    let totalSwept = ethers.BigNumber.from(0);

    for (const announcement of announcements) {
      try {
        // Skip if no ciphertext (legacy announcements before schema update)
        if (!announcement.ciphertext) {
          withdrawals.push({
            stealthAddress: announcement.stealthAddress,
            auctionId: announcement.auctionId,
            balanceWei: "0",
            txHash: null,
            error: "No ciphertext stored (legacy announcement) — cannot derive key",
          });
          continue;
        }

        // Verify this announcement is for this user using cryptographic check
        const isForUser = isAnnouncementForUser(
          registeredKeys?.spendingPublicKey || spendingPublicKey,
          viewingPrivateKey,
          announcement.stealthAddress,
          announcement.ephemeralPublicKey,
          announcement.ciphertext,
        );

        if (!isForUser) {
          // This announcement is stored under the user's address but doesn't
          // cryptographically match — shouldn't happen, but skip gracefully
          withdrawals.push({
            stealthAddress: announcement.stealthAddress,
            auctionId: announcement.auctionId,
            balanceWei: "0",
            txHash: null,
            error: "Announcement does not cryptographically match provided keys",
          });
          continue;
        }

        // Decrypt the random number to derive stealth private key
        const { KeyPair } = await import("@umbracash/umbra-js");
        const viewingKeyPair = new KeyPair(viewingPrivateKey);
        const decryptedRandom = viewingKeyPair.decrypt({
          ephemeralPublicKey: announcement.ephemeralPublicKey,
          ciphertext: announcement.ciphertext,
        });

        // Derive stealth private key
        const stealthPrivKey = computeStealthPrivateKey(spendingPrivateKey, decryptedRandom);

        // Check balance at the stealth address
        const balance = await provider.getBalance(announcement.stealthAddress);

        if (balance.isZero()) {
          withdrawals.push({
            stealthAddress: announcement.stealthAddress,
            auctionId: announcement.auctionId,
            balanceWei: "0",
            txHash: null,
            error: null, // no error, just empty
          });
          continue;
        }

        // Estimate gas cost to sweep
        const gasPrice = await provider.getGasPrice();
        const gasLimit = 21000; // simple ETH transfer
        const gasCost = gasPrice.mul(gasLimit);

        if (balance.lte(gasCost)) {
          withdrawals.push({
            stealthAddress: announcement.stealthAddress,
            auctionId: announcement.auctionId,
            balanceWei: balance.toString(),
            txHash: null,
            error: `Balance (${ethers.utils.formatEther(balance)} ETH) is less than gas cost (${ethers.utils.formatEther(gasCost)} ETH)`,
          });
          continue;
        }

        // Sweep: send (balance - gasCost) to destination
        const sweepAmount = balance.sub(gasCost);
        const stealthWallet = new ethers.Wallet(stealthPrivKey, provider);

        const tx = await stealthWallet.sendTransaction({
          to: destinationAddress,
          value: sweepAmount,
          gasLimit,
          gasPrice,
        });

        const receipt = await tx.wait();

        totalSwept = totalSwept.add(sweepAmount);

        withdrawals.push({
          stealthAddress: announcement.stealthAddress,
          auctionId: announcement.auctionId,
          balanceWei: sweepAmount.toString(),
          txHash: receipt.transactionHash,
          error: null,
        });
      } catch (err) {
        console.error(`Sweep failed for ${announcement.stealthAddress}:`, err);
        withdrawals.push({
          stealthAddress: announcement.stealthAddress,
          auctionId: announcement.auctionId,
          balanceWei: "0",
          txHash: null,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      success: true,
      destinationAddress,
      lookupAddress,
      announcementsScanned: announcements.length,
      withdrawals,
      totalSweptWei: totalSwept.toString(),
      totalSweptEth: ethers.utils.formatEther(totalSwept),
    });
  } catch (error) {
    console.error("withdraw error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: message, stack: error instanceof Error ? error.stack?.split("\n").slice(0, 5) : undefined },
      { status: 500 },
    );
  }
}
