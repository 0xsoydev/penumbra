import { and, eq } from "drizzle-orm";
import { db } from "~~/db";
import { auctions, deposits, stealthAnnouncements, stealthKeys } from "~~/db/schema";
import { getSpendableBalance, sendMany } from "~~/services/penumbra/bitgo";
import { generateStealthAddress } from "~~/services/penumbra/umbra";

// Base Sepolia gas reserve: 0.00005 ETH = 50_000_000_000_000 wei
const GAS_RESERVE = BigInt("50000000000000");

export type PayoutResult = {
  status: "paid" | "already_paid" | "no_winner" | "insufficient_balance";
  bitgoTxId?: string;
  sellerAddress?: string;
  amountWei?: string;
  spendableBalance?: string;
};

/**
 * Execute the ETH payout for a settled auction.
 *
 * This function is idempotent:
 *   - If auctions.payoutTxId is already set, returns "already_paid" immediately.
 *   - If no winning deposit exists, returns "no_winner".
 *   - If spendable balance is too low, returns "insufficient_balance" (caller can retry).
 *   - Checks for existing stealth announcement before inserting (no duplicates).
 *
 * Called from:
 *   - POST /api/auction/[id]/settle (after declareWinner)
 *   - POST /api/webhooks/bitgo (when deposit confirms)
 */
export async function executePayout(auctionId: number): Promise<PayoutResult> {
  // 1. Fetch auction
  const [auction] = await db.select().from(auctions).where(eq(auctions.id, auctionId));
  if (!auction) {
    throw new Error(`Auction ${auctionId} not found in DB`);
  }

  // 2. Idempotency check — already paid?
  if (auction.payoutTxId) {
    console.log(`[payout] Auction ${auctionId} already paid: ${auction.payoutTxId}`);
    return { status: "already_paid", bitgoTxId: auction.payoutTxId };
  }

  // 3. Find winning deposit
  const allDeposits = await db.select().from(deposits).where(eq(deposits.auctionId, auctionId));
  const winningDeposit = allDeposits.find(d => d.isWinner);

  if (!winningDeposit || !winningDeposit.bidAmount) {
    console.log(`[payout] Auction ${auctionId}: no winner declared yet`);
    return { status: "no_winner" };
  }

  // 4. Check spendable balance
  const spendable = await getSpendableBalance(auction.bitgoWalletId);
  const spendableBalance = BigInt(spendable);
  const availableToSend = spendableBalance > GAS_RESERVE ? spendableBalance - GAS_RESERVE : 0n;

  console.log(`[payout] Auction ${auctionId}: spendable=${spendable}, available=${availableToSend.toString()}`);

  if (availableToSend === 0n) {
    console.warn(`[payout] Auction ${auctionId}: insufficient spendable balance (${spendable} wei)`);
    return { status: "insufficient_balance", spendableBalance: spendable };
  }

  // 5. Cap seller payment to what's available
  const sellerAmount =
    BigInt(winningDeposit.bidAmount) > availableToSend ? availableToSend : BigInt(winningDeposit.bidAmount);

  // 6. Determine seller payment address (stealth or direct)
  const [sellerKeys] = await db
    .select()
    .from(stealthKeys)
    .where(eq(stealthKeys.address, auction.sellerAddress.toLowerCase()));

  let sellerPaymentAddress: string;

  // Check for existing stealth announcement (idempotency — don't duplicate)
  const existingAnnouncements = await db
    .select()
    .from(stealthAnnouncements)
    .where(
      and(
        eq(stealthAnnouncements.auctionId, auctionId),
        eq(stealthAnnouncements.recipientAddress, auction.sellerAddress.toLowerCase()),
      ),
    );

  if (existingAnnouncements.length > 0) {
    // Reuse existing stealth address
    sellerPaymentAddress = existingAnnouncements[0].stealthAddress;
    console.log(`[payout] Reusing existing stealth address for seller: ${sellerPaymentAddress}`);
  } else if (sellerKeys) {
    // Generate new stealth address
    const sellerStealth = generateStealthAddress(sellerKeys.spendingPublicKey, sellerKeys.viewingPublicKey);
    sellerPaymentAddress = sellerStealth.stealthAddress;

    await db.insert(stealthAnnouncements).values({
      recipientAddress: auction.sellerAddress.toLowerCase(),
      ephemeralPublicKey: sellerStealth.ephemeralPublicKey,
      ciphertext: sellerStealth.ciphertext,
      stealthAddress: sellerStealth.stealthAddress,
      auctionId,
    });
    console.log(`[payout] Generated stealth address for seller: ${sellerPaymentAddress}`);
  } else {
    sellerPaymentAddress = auction.sellerAddress;
    console.warn(`[payout] Seller ${auction.sellerAddress} has no stealth keys — paying directly`);
  }

  // 7. Build recipient list
  const recipients: { address: string; amount: string }[] = [
    { address: sellerPaymentAddress, amount: sellerAmount.toString() },
  ];

  // Refund losers
  for (const deposit of allDeposits) {
    if (deposit.id !== winningDeposit.id && deposit.confirmed && deposit.amountWei !== "0") {
      recipients.push({
        address: deposit.bidderAddress,
        amount: deposit.amountWei,
      });
    }
  }

  // 8. Send
  console.log(`[payout] Sending to ${recipients.length} recipients:`, JSON.stringify(recipients));
  const txId = await sendMany(auction.bitgoWalletId, recipients);

  // 9. Record payout (idempotency flag)
  await db.update(auctions).set({ payoutTxId: txId }).where(eq(auctions.id, auctionId));

  console.log(`[payout] Auction ${auctionId} payout complete: ${txId}`);
  return {
    status: "paid",
    bitgoTxId: txId,
    sellerAddress: sellerPaymentAddress,
    amountWei: sellerAmount.toString(),
  };
}
