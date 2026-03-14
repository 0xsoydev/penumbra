import { useEnsAddress, useEnsText } from "wagmi";
import { normalize } from "viem/ens";

/**
 * Resolves a seller's public auction identity entirely through ENS text records.
 *
 * The seller registers a dedicated ENS name (e.g. "penumbra-auction-42.eth") and
 * sets text records on it. We read those records here — the seller's real 0x address
 * is NEVER touched by this hook. Privacy is preserved: the buyer sees only what the
 * seller chose to publish under their ENS name.
 *
 * Expected text records (all optional):
 *   penumbra.token       — human name of the token being auctioned (e.g. "USDC")
 *   penumbra.description — freeform description of the auction / terms
 *   penumbra.contact     — seller's preferred contact (e.g. "seller@protonmail.com")
 *   penumbra.docCid      — IPFS CID of the encrypted deal document (used by FileverseDocViewer)
 *   avatar               — standard ENS avatar record (seller's chosen profile image)
 */
export type EnsAuctionIdentity = {
  /** The raw ENS name passed in, e.g. "penumbra-auction-42.eth" */
  ensName: string;
  /** Resolved 0x address of the ENS name — undefined until resolved, null if unregistered */
  resolvedAddress: `0x${string}` | null | undefined;
  /** penumbra.token text record */
  tokenLabel: string | null | undefined;
  /** penumbra.description text record */
  description: string | null | undefined;
  /** penumbra.contact text record */
  contact: string | null | undefined;
  /** penumbra.docCid text record */
  docCid: string | null | undefined;
  /** standard ENS avatar record */
  avatar: string | null | undefined;
  /** true while any record is still loading */
  isLoading: boolean;
  /** true if the ENS name resolved to an address (i.e. it is a real, registered name) */
  isValid: boolean;
};

export function useEnsAuctionIdentity(ensName: string | null | undefined): EnsAuctionIdentity {
  const normalized = ensName ? normalize(ensName) : undefined;

  const { data: resolvedAddress, isLoading: loadingAddress } = useEnsAddress({
    name: normalized,
    chainId: 1,
  });

  const { data: tokenLabel, isLoading: loadingToken } = useEnsText({
    name: normalized,
    key: "penumbra.token",
    chainId: 1,
  });

  const { data: description, isLoading: loadingDesc } = useEnsText({
    name: normalized,
    key: "penumbra.description",
    chainId: 1,
  });

  const { data: contact, isLoading: loadingContact } = useEnsText({
    name: normalized,
    key: "penumbra.contact",
    chainId: 1,
  });

  const { data: docCid, isLoading: loadingDocCid } = useEnsText({
    name: normalized,
    key: "penumbra.docCid",
    chainId: 1,
  });

  const { data: avatar, isLoading: loadingAvatar } = useEnsText({
    name: normalized,
    key: "avatar",
    chainId: 1,
  });

  const isLoading =
    loadingAddress || loadingToken || loadingDesc || loadingContact || loadingDocCid || loadingAvatar;

  return {
    ensName: ensName ?? "",
    resolvedAddress,
    tokenLabel,
    description,
    contact,
    docCid,
    avatar,
    isLoading,
    isValid: !!resolvedAddress,
  };
}
