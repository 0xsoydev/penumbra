import { BitGoAPI } from "@bitgo/sdk-api";
import { Eth } from "@bitgo/sdk-coin-eth";

// ----------------------------------------------------------------
// BitGo service — server-side only
// Uses tbaseeth (Base Sepolia testnet) on the BitGo test env
// ----------------------------------------------------------------

const BITGO_ACCESS_TOKEN = process.env.BITGO_ACCESS_TOKEN || "";
const BITGO_ENTERPRISE_ID = process.env.BITGO_ENTERPRISE_ID || "";
const WALLET_PASSPHRASE = process.env.BITGO_WALLET_PASSPHRASE || "auction-passphrase";

// Base Sepolia on BitGo test
const COIN = "tbaseeth";

let _sdk: BitGoAPI | null = null;
let _unlockExpires = 0;

function getSdk(): BitGoAPI {
  if (_sdk) return _sdk;
  _sdk = new BitGoAPI({
    accessToken: BITGO_ACCESS_TOKEN,
    env: "test" as const,
  });
  // Register the coin module
  _sdk.register(COIN, Eth.createInstance);
  return _sdk;
}

/**
 * Ensure the BitGo session is unlocked for sending.
 * In test env, OTP "000000" is accepted.
 * Caches the unlock for 50 minutes (BitGo grants 60min).
 */
async function ensureUnlocked(): Promise<void> {
  if (Date.now() < _unlockExpires) return; // still valid
  const sdk = getSdk();
  await sdk.unlock({ otp: "000000", duration: 3600 });
  _unlockExpires = Date.now() + 50 * 60 * 1000; // cache for 50 min
  console.log("[BitGo] Session unlocked for sending");
}

// ----------------------------------------------------------------
// Wallet management
// ----------------------------------------------------------------

/**
 * Create a new BitGo wallet for an auction.
 * Each auction gets its own wallet to isolate funds.
 * Returns { walletId, walletAddress }.
 */
export async function createAuctionWallet(auctionId: number): Promise<{
  walletId: string;
  walletAddress: string;
  feeAddress: string;
  baseAddress: string;
}> {
  const sdk = getSdk();
  const coin = sdk.coin(COIN);
  const wallets = coin.wallets();

  const result = await wallets.generateWallet({
    label: `penumbra-auction-${auctionId}`,
    passphrase: WALLET_PASSPHRASE,
    enterprise: BITGO_ENTERPRISE_ID,
    walletVersion: 3,
  });

  const wallet = result.wallet;
  const walletId = wallet.id();
  const walletAddress = wallet.receiveAddress() || "";

  // Extract fee + base addresses from coinSpecific for gas funding
  const data = wallet.toJSON();
  const coinSpecific = data.coinSpecific as unknown as Record<string, string> | undefined;
  const feeAddress = coinSpecific?.feeAddress || "";
  const baseAddress = coinSpecific?.baseAddress || walletAddress;

  return { walletId, walletAddress, feeAddress, baseAddress };
}

/**
 * Create a unique deposit address for a bidder within an auction wallet.
 * This lets us track which bidder deposited what.
 * Returns the new deposit address string.
 */
export async function createDepositAddress(walletId: string, bidderAddress: string): Promise<string> {
  const sdk = getSdk();
  const coin = sdk.coin(COIN);
  const wallet = await coin.wallets().get({ id: walletId });

  const address = await wallet.createAddress({
    label: `bidder-${bidderAddress}`,
  });

  return address.address;
}

/**
 * Get wallet balance in wei (base units).
 */
export async function getWalletBalance(walletId: string): Promise<string> {
  const sdk = getSdk();
  const coin = sdk.coin(COIN);
  const wallet = await coin.wallets().get({ id: walletId });
  return wallet.balanceString() || "0";
}

/**
 * Get wallet spendable balance in wei (confirmed funds only).
 * BitGo requires funds to be confirmed before they can be sent.
 */
export async function getSpendableBalance(walletId: string): Promise<string> {
  const sdk = getSdk();
  const coin = sdk.coin(COIN);
  const wallet = await coin.wallets().get({ id: walletId });
  return wallet.spendableBalanceString() || "0";
}

// ----------------------------------------------------------------
// Sending / Settlement
// ----------------------------------------------------------------

type Recipient = {
  address: string;
  amount: string; // wei
};

/**
 * Send ETH to multiple recipients in a single transaction.
 * Used during settlement: send to seller's stealth address + refund losers.
 */
export async function sendMany(walletId: string, recipients: Recipient[]): Promise<string> {
  const sdk = getSdk();
  await ensureUnlocked();
  const coin = sdk.coin(COIN);
  const wallet = await coin.wallets().get({ id: walletId });

  console.log(
    "[BitGo] sendMany — wallet balance:",
    wallet.balanceString(),
    "spendable:",
    wallet.spendableBalanceString(),
  );
  console.log("[BitGo] sendMany — recipients:", JSON.stringify(recipients));

  const result = await wallet.sendMany({
    type: "transfer",
    recipients: recipients.map(r => ({
      address: r.address,
      amount: r.amount,
    })),
    walletPassphrase: WALLET_PASSPHRASE,
  });

  return result.txid as string;
}

/**
 * Refund a single bidder (convenience wrapper around sendMany).
 */
export async function refundBidder(walletId: string, toAddress: string, amountWei: string): Promise<string> {
  return sendMany(walletId, [{ address: toAddress, amount: amountWei }]);
}

// ----------------------------------------------------------------
// Webhook verification
// ----------------------------------------------------------------

/**
 * Verify a BitGo webhook payload.
 * In test env, we do a basic check that the expected fields exist.
 * In production you'd verify the HMAC signature.
 */
export function verifyWebhook(body: Record<string, unknown>): boolean {
  // Minimal validation — confirm required fields present
  return !!(body.type && body.wallet && body.hash);
}

// ----------------------------------------------------------------
// Webhook registration
// ----------------------------------------------------------------

/**
 * Register a transfer webhook on a BitGo wallet.
 * BitGo will POST to `url` whenever a transfer is confirmed.
 *
 * @param walletId — the BitGo wallet to monitor
 * @param url — public HTTPS endpoint (e.g., https://app.vercel.app/api/webhooks/bitgo)
 * @param numConfirmations — block confirmations before firing (default 1)
 */
export async function registerWebhook(
  walletId: string,
  url: string,
  numConfirmations = 1,
): Promise<{ id: string; type: string; url: string }> {
  const sdk = getSdk();
  const coin = sdk.coin(COIN);
  const wallet = await coin.wallets().get({ id: walletId });

  const result = await wallet.addWebhook({
    type: "transfer",
    url,
    numConfirmations,
  } as Parameters<typeof wallet.addWebhook>[0]);

  console.log(`[BitGo] Webhook registered for wallet ${walletId}: ${url} (${numConfirmations} confirmations)`);
  return result as { id: string; type: string; url: string };
}

/**
 * List all webhooks on a wallet.
 */
export async function listWebhooks(walletId: string): Promise<unknown[]> {
  const sdk = getSdk();
  const coin = sdk.coin(COIN);
  const wallet = await coin.wallets().get({ id: walletId });
  const result = await wallet.listWebhooks();
  return (result as { webhooks?: unknown[] })?.webhooks || [];
}

// ----------------------------------------------------------------
// Transfer details
// ----------------------------------------------------------------

/**
 * Get details of a specific transfer on a wallet.
 * Used by the webhook handler to determine which deposit address received ETH
 * and how much.
 */
export async function getTransfer(
  walletId: string,
  transferId: string,
): Promise<{
  id: string;
  txid: string;
  state: string;
  entries: Array<{ address: string; value: number; valueString: string }>;
}> {
  const sdk = getSdk();
  const coin = sdk.coin(COIN);
  const wallet = await coin.wallets().get({ id: walletId });

  const transfer = await wallet.getTransfer({ id: transferId });
  return transfer as {
    id: string;
    txid: string;
    state: string;
    entries: Array<{ address: string; value: number; valueString: string }>;
  };
}
