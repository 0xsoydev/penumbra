import { NextRequest, NextResponse } from "next/server";
import { db } from "~~/db";
import { stealthKeys } from "~~/db/schema";

/**
 * POST /api/stealth/register
 *
 * Store a user's stealth meta-address (spending + viewing public keys).
 * Called once per user when they first set up stealth payments.
 *
 * Body: { address, spendingPublicKey, viewingPublicKey }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { address, spendingPublicKey, viewingPublicKey } = body;

    if (!address || !spendingPublicKey || !viewingPublicKey) {
      return NextResponse.json(
        { error: "Missing required fields: address, spendingPublicKey, viewingPublicKey" },
        { status: 400 },
      );
    }

    // Validate key formats (uncompressed public keys = 132 chars with 0x04 prefix)
    if (spendingPublicKey.length !== 132 || !spendingPublicKey.startsWith("0x04")) {
      return NextResponse.json(
        { error: "spendingPublicKey must be an uncompressed public key (132 hex chars, 0x04 prefix)" },
        { status: 400 },
      );
    }
    if (viewingPublicKey.length !== 132 || !viewingPublicKey.startsWith("0x04")) {
      return NextResponse.json(
        { error: "viewingPublicKey must be an uncompressed public key (132 hex chars, 0x04 prefix)" },
        { status: 400 },
      );
    }

    // Upsert — if address already exists, update keys
    await db
      .insert(stealthKeys)
      .values({
        address: address.toLowerCase(),
        spendingPublicKey,
        viewingPublicKey,
      })
      .onConflictDoUpdate({
        target: stealthKeys.address,
        set: { spendingPublicKey, viewingPublicKey },
      });

    return NextResponse.json({ success: true, address: address.toLowerCase() });
  } catch (error) {
    console.error("stealth/register error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
