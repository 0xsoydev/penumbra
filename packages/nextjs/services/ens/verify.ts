import { type Address, createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const getMainnetClient = (() => {
  let client: ReturnType<typeof createPublicClient> | null = null;

  return () => {
    if (client) return client;

    const rpc = process.env.MAINNET_RPC_URL;
    if (!rpc) {
      throw new Error("MAINNET_RPC_URL is required for ENS verification");
    }

    client = createPublicClient({
      chain: mainnet,
      transport: http(rpc),
    });

    return client;
  };
})();

/**
 * Check whether a wallet address has a primary ENS name set (reverse resolution).
 *
 * Uses mainnet Universal Resolver with CCIP-Read, so it detects .eth,
 * .base.eth, .cb.id, and any other CCIP-Read primary names.
 *
 * Privacy-preserving: returns only a boolean.
 */
export async function isEnsVerified(address: Address): Promise<boolean> {
  try {
    const client = getMainnetClient();
    const name = await client.getEnsName({
      address,
      gatewayUrls: ["https://ccip.ens.xyz"],
    });
    return !!name;
  } catch (error) {
    console.warn("ENS reverse resolution failed:", error);
    return false;
  }
}
