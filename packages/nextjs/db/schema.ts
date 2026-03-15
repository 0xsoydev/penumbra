import { bigint, boolean, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const auctions = pgTable("auctions", {
  id: bigint("id", { mode: "number" }).primaryKey(), // matches on-chain auctionId
  sellerAddress: text("seller_address").notNull(),
  bitgoWalletId: text("bitgo_wallet_id").notNull(),
  bitgoWalletAddress: text("bitgo_wallet_address").notNull(),
  ensName: text("ens_name"), // pseudonym flow only — NEVER store the reverse-resolved ENS name here
  ensVerified: boolean("ens_verified").notNull().default(false),
  docCid: text("doc_cid"),
  payoutTxId: text("payout_tx_id"), // BitGo txId once seller has been paid — null = not yet paid
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const deposits = pgTable("deposits", {
  id: serial("id").primaryKey(),
  auctionId: bigint("auction_id", { mode: "number" })
    .notNull()
    .references(() => auctions.id),
  bidderAddress: text("bidder_address").notNull(), // for BitGo refund routing only — never on-chain
  bitgoDepositAddress: text("bitgo_deposit_address").notNull(),
  amountWei: text("amount_wei").notNull().default("0"),
  confirmed: boolean("confirmed").notNull().default(false),

  // ZK privacy fields
  nullifier: text("nullifier"), // pedersen_hash(secret) — the on-chain pseudonym
  secret: text("secret"), // the secret value (hex) — only known to bidder + backend
  salt: text("salt"), // random salt for commit hash
  commitHash: text("commit_hash"), // keccak256(abi.encodePacked(bidAmount, salt, nullifier))
  bidAmount: text("bid_amount"), // bid amount in wei (kept off-chain, never on-chain)
  committed: boolean("committed").notNull().default(false), // true once relayed to contract
  isWinner: boolean("is_winner").notNull().default(false), // set by backend after off-chain reveal
});

export const stealthKeys = pgTable("stealth_keys", {
  address: text("address").primaryKey(),
  spendingPublicKey: text("spending_public_key").notNull(),
  viewingPublicKey: text("viewing_public_key").notNull(),
});

export const stealthAnnouncements = pgTable("stealth_announcements", {
  id: serial("id").primaryKey(),
  recipientAddress: text("recipient_address").notNull(),
  ephemeralPublicKey: text("ephemeral_public_key").notNull(),
  ciphertext: text("ciphertext"), // encrypted random number — needed to derive stealth private key
  stealthAddress: text("stealth_address").notNull(),
  auctionId: bigint("auction_id", { mode: "number" }).notNull(),
});
