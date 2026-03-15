import { Barretenberg, UltraHonkBackend } from "@aztec/bb.js";
import { Noir } from "@noir-lang/noir_js";
import { ethers } from "ethers";
import { readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Set CRS cache path BEFORE any bb.js imports — defaults to ~/.bb-crs which fails on Vercel
// Must be set at module load time, before Barretenberg class is instantiated
if (!process.env.CRS_PATH) {
  process.env.CRS_PATH = "/tmp/.bb-crs";
}

// ----------------------------------------------------------------
// ZK Proof Service — server-side only
// Generates proofs for the nullifier_claim circuit
// Circuit: proves knowledge of `secret` such that pedersen_hash(secret) == nullifier
// ----------------------------------------------------------------

// Load compiled circuit artifact
// Primary: local copy in packages/nextjs/data/ (works on Vercel)
// Fallback: original location in packages/foundry/ (works in local dev)
const CIRCUIT_PATHS = [
  join(process.cwd(), "data", "circuits", "nullifier_claim.json"),
  join(process.cwd(), "..", "foundry", "circuits", "nullifier_claim", "target", "nullifier_claim.json"),
];

let circuitArtifact: any = null;
let noirInstance: InstanceType<typeof Noir> | null = null;
let backendInstance: InstanceType<typeof UltraHonkBackend> | null = null;
let bbInstance: InstanceType<typeof Barretenberg> | null = null;

function getCircuit() {
  if (!circuitArtifact) {
    let raw: string | null = null;
    for (const p of CIRCUIT_PATHS) {
      try {
        raw = readFileSync(p, "utf-8");
        console.log(`[zkproof] Loaded circuit from: ${p}`);
        break;
      } catch {
        // Try next path
      }
    }
    if (!raw) {
      throw new Error(`Circuit artifact not found. Tried: ${CIRCUIT_PATHS.join(", ")}`);
    }
    circuitArtifact = JSON.parse(raw);
  }
  return circuitArtifact;
}

async function getBb() {
  if (!bbInstance) {
    // Use /tmp for CRS cache — required for Vercel serverless (home dir is read-only)
    const crsPath = process.env.CRS_PATH || join(tmpdir(), ".bb-crs");
    bbInstance = await Barretenberg.new({ crsPath });
  }
  return bbInstance;
}

async function getNoir() {
  if (!noirInstance) {
    const circuit = getCircuit();
    noirInstance = new Noir(circuit);
  }
  return noirInstance;
}

async function getBackend() {
  if (!backendInstance) {
    const circuit = getCircuit();
    const bb = await getBb();
    backendInstance = new UltraHonkBackend(circuit.bytecode, bb);
  }
  return backendInstance;
}

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

/**
 * Compute the nullifier (pedersen hash) for a given secret.
 * Uses Barretenberg WASM to ensure consistency with the ZK circuit.
 *
 * @param secret The secret value (hex string or decimal string)
 * @returns The nullifier as a 0x-prefixed bytes32 hex string
 */
export async function computeNullifier(secret: string): Promise<string> {
  const bb = await getBb();

  // Convert secret to a 32-byte big-endian buffer
  const secretBn = ethers.BigNumber.from(secret);
  const secretHex = ethers.utils.hexZeroPad(secretBn.toHexString(), 32);
  const secretBytes = new Uint8Array(Buffer.from(secretHex.slice(2), "hex"));

  // Compute pedersen hash using Barretenberg
  const result = await bb.pedersenHash({ inputs: [secretBytes], hashIndex: 0 });

  // Extract hash bytes from the result object
  const hashBytes = new Uint8Array(Object.values(result.hash));
  return "0x" + Buffer.from(hashBytes).toString("hex");
}

/**
 * Generate a random secret and compute its nullifier (pedersen hash).
 * Used when a bidder places a bid — the backend generates the
 * secret/nullifier pair and stores the secret in the DB.
 */
export async function generateSecretAndNullifier(): Promise<{
  secret: string; // hex string (field element)
  nullifier: string; // bytes32 hex (pedersen_hash(secret))
}> {
  // Generate a random field element as the secret
  // Using 31 bytes to stay within the BN254 field
  const randomBytes = ethers.utils.randomBytes(31);
  const secret = ethers.BigNumber.from(randomBytes).toHexString();

  const nullifier = await computeNullifier(secret);
  return { secret, nullifier };
}

/**
 * Generate a ZK proof that the caller knows the secret behind a nullifier.
 * This proof can be submitted on-chain via claimWithProof().
 *
 * @param secret The secret value (hex string or decimal string)
 * @param nullifier The nullifier = pedersen_hash(secret) (bytes32 hex)
 * @returns proof bytes (hex string) ready for on-chain submission
 */
export async function generateClaimProof(
  secret: string,
  nullifier: string,
): Promise<{
  proofHex: string; // 0x-prefixed hex-encoded proof bytes for contract call
  publicInputs: string[]; // the nullifier as the only public input
}> {
  const noir = await getNoir();
  const backend = await getBackend();

  // Execute the circuit to generate the witness
  // The circuit expects: secret (private), nullifier (public)
  // It asserts: pedersen_hash([secret]) == nullifier
  const { witness } = await noir.execute({
    secret: secret,
    nullifier: nullifier,
  });

  // Generate the proof — must use verifierTarget: 'evm' to produce keccak-based
  // ZK proofs that match the deployed BaseZKHonkVerifier contract on-chain.
  // Without this, bb.js defaults to poseidon2 (16,256 byte proofs) instead of
  // keccak (8,256 byte proofs) and the Solidity verifier will reject them.
  const proofData = await backend.generateProof(witness, { verifierTarget: "evm" });

  // The proof bytes for on-chain verification
  const proofHex = "0x" + Buffer.from(proofData.proof).toString("hex");

  return {
    proofHex,
    publicInputs: proofData.publicInputs,
  };
}

/**
 * Verify a proof locally (for testing — on-chain verification is the real check).
 */
export async function verifyProofLocally(proofHex: string, publicInputs: string[]): Promise<boolean> {
  const backend = await getBackend();

  const proofBytes = new Uint8Array(Buffer.from(proofHex.replace("0x", ""), "hex"));

  return backend.verifyProof(
    {
      proof: proofBytes,
      publicInputs,
    },
    { verifierTarget: "evm" },
  );
}

/**
 * Generate a commit hash for a bid.
 * commitHash = keccak256(abi.encodePacked(bidAmount, salt, nullifier))
 *
 * This matches the on-chain verification pattern.
 */
export function generateCommitHash(bidAmountWei: string, salt: string, nullifier: string): string {
  return ethers.utils.solidityKeccak256(["uint256", "bytes32", "bytes32"], [bidAmountWei, salt, nullifier]);
}

/**
 * Generate a random salt for bid commitment.
 */
export function generateSalt(): string {
  return ethers.utils.hexlify(ethers.utils.randomBytes(32));
}
