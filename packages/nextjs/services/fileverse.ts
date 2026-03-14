// Client-safe: @fileverse/fileverse-crypto uses NaCl secretbox — browser compatible.
// Do NOT import ethers, umbra-js, or any server-only service here.

import { secretbox, randomBytes } from "tweetnacl";
import { encodeBase64, decodeBase64 } from "tweetnacl-util";

/**
 * Encrypt content and upload to IPFS via web3.storage.
 * Returns the IPFS CID of the encrypted blob.
 */
export async function encryptAndUploadDoc(content: string, secretKey: Uint8Array): Promise<string> {
  const contentBytes = new TextEncoder().encode(content);
  const nonce = randomBytes(secretbox.nonceLength);
  const encrypted = secretbox(contentBytes, nonce, secretKey);

  // Prepend nonce to encrypted bytes so we can recover it on decrypt
  const combined = new Uint8Array(nonce.length + encrypted.length);
  combined.set(nonce);
  combined.set(encrypted, nonce.length);

  const formData = new FormData();
  formData.append("file", new Blob([combined], { type: "application/octet-stream" }), "doc.enc");

  const token = process.env.NEXT_PUBLIC_WEB3_STORAGE_TOKEN ?? "";
  const res = await fetch("https://api.web3.storage/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!res.ok) throw new Error(`web3.storage upload failed: ${res.statusText}`);
  const { cid } = await res.json();
  return cid as string;
}

/**
 * Fetch encrypted blob from IPFS and decrypt with NaCl secretbox.
 */
export async function fetchAndDecryptDoc(cid: string, secretKey: Uint8Array): Promise<string> {
  const res = await fetch(`https://w3s.link/ipfs/${cid}`);
  if (!res.ok) throw new Error(`Failed to fetch from IPFS: ${res.statusText}`);

  const combined = new Uint8Array(await res.arrayBuffer());
  const nonce = combined.slice(0, secretbox.nonceLength);
  const ciphertext = combined.slice(secretbox.nonceLength);

  const decrypted = secretbox.open(ciphertext, nonce, secretKey);
  if (!decrypted) throw new Error("Decryption failed — wrong key or corrupted data");

  return new TextDecoder().decode(decrypted);
}

// Export helpers for generating a random 32-byte key (used by seller on auction create)
export function generateSecretKey(): Uint8Array {
  return randomBytes(secretbox.keyLength);
}

export function secretKeyToBase64(key: Uint8Array): string {
  return encodeBase64(key);
}

export function base64ToSecretKey(b64: string): Uint8Array {
  return decodeBase64(b64);
}
