import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "~~/db";
import { deposits } from "~~/db/schema";
import { computeNullifier, generateClaimProof } from "~~/services/penumbra/zkproof";

/**
 * POST /api/auction/[id]/claim
 *
 * Generate a ZK proof for the winning bidder to claim their tokens.
 *
 * The winner provides their secret (which was given to them when they bid).
 * The backend generates a ZK proof that proves knowledge of the secret
 * behind the winning nullifier. The winner then submits this proof on-chain
 * from a burner wallet via claimWithProof().
 *
 * Body: { secret }
 *   - secret: the bidder's secret (given during deposit)
 *
 * Returns: { proofHex, nullifier, publicInputs }
 *   - proofHex: the ZK proof bytes to submit on-chain
 *   - nullifier: the winning nullifier
 *   - publicInputs: public inputs for the verifier
 *
 * The winner then calls:
 *   contract.claimWithProof(auctionId, proofHex, stealthAddress)
 *   from ANY wallet (burner). msg.sender is irrelevant.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auctionId = parseInt(id, 10);
    if (isNaN(auctionId)) {
      return NextResponse.json({ error: "Invalid auction ID" }, { status: 400 });
    }

    const body = await req.json();
    const { secret } = body;

    if (!secret) {
      return NextResponse.json({ error: "Missing required field: secret" }, { status: 400 });
    }

    // Compute nullifier from secret
    const nullifier = await computeNullifier(secret);

    // Verify this nullifier corresponds to a winning bid in this auction
    const [deposit] = await db
      .select()
      .from(deposits)
      .where(and(eq(deposits.auctionId, auctionId), eq(deposits.isWinner, true)));

    if (!deposit) {
      return NextResponse.json({ error: "No winner declared for this auction" }, { status: 400 });
    }

    if (deposit.nullifier?.toLowerCase() !== nullifier.toLowerCase()) {
      return NextResponse.json({ error: "Secret does not match the winning nullifier" }, { status: 403 });
    }

    // Generate ZK proof
    console.log(`Generating ZK proof for auction ${auctionId}, nullifier: ${nullifier}`);
    const { proofHex, publicInputs } = await generateClaimProof(secret, nullifier);
    console.log(`ZK proof generated, size: ${proofHex.length / 2 - 1} bytes`);

    return NextResponse.json({
      success: true,
      proofHex,
      nullifier,
      publicInputs,
      instructions: [
        "1. Generate a burner wallet (any fresh EOA)",
        "2. Fund it with a tiny amount of ETH for gas (~0.01 ETH)",
        "3. Call claimWithProof(auctionId, proofHex, yourStealthAddress) from the burner",
        "4. IMPORTANT: Set gasLimit to at least 3,000,000 — ZK verification uses ~2.6M gas",
        "5. Tokens will be sent to your stealth address",
        "6. msg.sender (burner) is irrelevant — only the proof matters",
      ],
      gasLimit: 3_000_000,
    });
  } catch (error) {
    console.error("auction/[id]/claim error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
