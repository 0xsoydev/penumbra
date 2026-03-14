// @ts-nocheck — umbra-js v0.2.2 ships incomplete type declarations
import { KeyPair, RandomNumber, Umbra } from "@umbracash/umbra-js";

// ----------------------------------------------------------------
// Umbra stealth-address service — server-side only
//
// Uses the VERIFIED @umbracash/umbra-js v0.2.2 API:
//   - KeyPair(hexKey)         — 66-char privkey OR 132-char uncompressed pubkey
//   - RandomNumber()          — zero args, generates 32 random bytes
//   - keyPair.mulPublicKey(r) — EC multiply, returns new KeyPair (pubkey-only)
//   - keyPair.encrypt(r)      — ECDH encrypt, returns { ephemeralPublicKey, ciphertext }
//   - keyPair.decrypt(payload)— ECDH decrypt, returns hex string
//   - KeyPair.compressPublicKey(pk) — returns { pubKeyXCoordinate }
//   - Umbra.computeStealthPrivateKey(spendPrivKey, r) — returns stealth privkey hex
//   - .address                — checksummed Ethereum address
//   - .publicKeyHex           — uncompressed pubkey with 0x04 prefix
//   - .privateKeyHex          — privkey hex or null
// ----------------------------------------------------------------

export type StealthPaymentData = {
  stealthAddress: string; // the address to send funds to
  ephemeralPublicKey: string; // full uncompressed ephemeral public key
  pubKeyXCoordinate: string; // compressed x-coordinate (for on-chain storage)
  ciphertext: string; // encrypted random number (for recipient scanning)
};

/**
 * Generate a stealth address for a recipient given their stealth meta-address
 * (spending public key + viewing public key).
 *
 * This is the core privacy operation:
 *   stealthAddress = address_of(spendingPubKey * randomNumber)
 *   ciphertext     = ECDH_encrypt(viewingPubKey, randomNumber)
 */
export function generateStealthAddress(spendingPublicKey: string, viewingPublicKey: string): StealthPaymentData {
  // 1. Construct KeyPairs from the recipient's registered public keys
  const spendingKeyPair = new KeyPair(spendingPublicKey);
  const viewingKeyPair = new KeyPair(viewingPublicKey);

  // 2. Generate fresh randomness (32 bytes)
  const randomNumber = new RandomNumber();

  // 3. Encrypt the random number with the viewing key (ECDH)
  //    Returns { ephemeralPublicKey, ciphertext }
  const encrypted = viewingKeyPair.encrypt(randomNumber);

  // 4. Compress ephemeral public key for gas-efficient on-chain storage
  const { pubKeyXCoordinate } = KeyPair.compressPublicKey(encrypted.ephemeralPublicKey);

  // 5. Derive the stealth address via EC multiplication
  const stealthKeyPair = spendingKeyPair.mulPublicKey(randomNumber);

  return {
    stealthAddress: stealthKeyPair.address,
    ephemeralPublicKey: encrypted.ephemeralPublicKey,
    pubKeyXCoordinate,
    ciphertext: encrypted.ciphertext,
  };
}

/**
 * Check if an announcement is intended for a specific user.
 * Used for recipient scanning (off-chain).
 *
 * @param spendingPublicKey — user's spending public key (132-char hex)
 * @param viewingPrivateKey — user's viewing PRIVATE key (66-char hex)
 * @param announcedStealthAddress — the stealth address from the announcement
 * @param ephemeralPublicKey — the ephemeral public key from the announcement
 * @param ciphertext — the encrypted random number from the announcement
 * @returns true if this announcement is for the user
 */
export function isAnnouncementForUser(
  spendingPublicKey: string,
  viewingPrivateKey: string,
  announcedStealthAddress: string,
  ephemeralPublicKey: string,
  ciphertext: string,
): boolean {
  const spendingKeyPair = new KeyPair(spendingPublicKey);
  const viewingKeyPair = new KeyPair(viewingPrivateKey);

  // Decrypt the random number using viewing private key
  const decryptedRandom = viewingKeyPair.decrypt({ ephemeralPublicKey, ciphertext });

  // Recompute the expected stealth address
  const computedStealthKeyPair = spendingKeyPair.mulPublicKey(decryptedRandom);

  return computedStealthKeyPair.address.toLowerCase() === announcedStealthAddress.toLowerCase();
}

/**
 * Compute the private key that controls a stealth address.
 * Needed when the backend must sign on behalf of a stealth address
 * (e.g., to approve token transfers).
 *
 * @param spendingPrivateKey — the recipient's spending private key
 * @param randomNumber — the decrypted random number (hex string)
 * @returns stealth private key as hex string
 */
export function computeStealthPrivateKey(spendingPrivateKey: string, randomNumber: string): string {
  return Umbra.computeStealthPrivateKey(spendingPrivateKey, randomNumber);
}
