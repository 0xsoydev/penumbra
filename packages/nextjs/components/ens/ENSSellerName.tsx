"use client";

import Image from "next/image";
import { useEnsAuctionIdentity } from "~~/hooks/useEnsAuctionIdentity";

type Props = {
  /**
   * The seller's dedicated auction ENS name, e.g. "penumbra-auction-42.eth".
   * Stored in the DB (auctions.ensName) — the seller's real wallet address is
   * never passed to this component, preserving seller privacy.
   */
  ensName: string | null | undefined;
};

/**
 * ENSSellerName — privacy-preserving seller identity card.
 *
 * The seller publishes their auction identity exclusively through ENS text records
 * on a dedicated name. This component resolves those records and renders them.
 * The seller's real 0x address is NEVER displayed — it lives only server-side
 * (in the DB and in the settlement contract call).
 *
 * Text records read (all optional, set by seller via ENS manager):
 *   penumbra.token       — e.g. "USDC", "WBTC"
 *   penumbra.description — auction terms, context, seller notes
 *   penumbra.contact     — e.g. Telegram handle, ProtonMail address
 *   penumbra.docCid      — IPFS CID fed into <FileverseDocViewer> upstream
 *   avatar               — seller's chosen profile image (standard ENS record)
 */
export function ENSSellerName({ ensName }: Props) {
  const { tokenLabel, description, contact, avatar, isLoading, isValid, resolvedAddress } =
    useEnsAuctionIdentity(ensName);

  // ── No ENS name configured by seller ──────────────────────────────────────
  if (!ensName) {
    return (
      <div className="flex items-center gap-2">
        <div className="avatar placeholder">
          <div className="bg-neutral text-neutral-content rounded-full w-8">
            <span className="text-xs">?</span>
          </div>
        </div>
        <span className="text-base-content/50 text-sm italic">Anonymous seller</span>
      </div>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center gap-3 animate-pulse">
        <div className="avatar placeholder">
          <div className="bg-base-300 rounded-full w-8 h-8" />
        </div>
        <div className="flex flex-col gap-1">
          <div className="h-3 w-32 bg-base-300 rounded" />
          <div className="h-2 w-20 bg-base-300 rounded" />
        </div>
      </div>
    );
  }

  // ── ENS name not registered / unresolvable ─────────────────────────────────
  if (!isValid) {
    return (
      <div className="flex items-center gap-2">
        <div className="avatar placeholder">
          <div className="bg-warning/20 text-warning rounded-full w-8">
            <span className="text-xs">!</span>
          </div>
        </div>
        <span className="badge badge-warning badge-sm">{ensName}</span>
        <span className="text-base-content/40 text-xs">· unresolved</span>
      </div>
    );
  }

  // ── Resolved identity ──────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-2">
      {/* Name row */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Avatar */}
        <div className="avatar">
          <div className="w-8 rounded-full ring ring-primary ring-offset-base-100 ring-offset-1">
            {avatar ? (
              <Image src={avatar} alt={ensName} width={32} height={32} className="rounded-full" />
            ) : (
              <div className="bg-primary/20 w-full h-full flex items-center justify-center rounded-full">
                <span className="text-primary text-xs font-bold">
                  {ensName.slice(0, 2).toUpperCase()}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ENS name — the only identity shown to bidders */}
        <span className="font-mono font-semibold text-sm">{ensName}</span>

        {/* Token badge */}
        {tokenLabel && (
          <span className="badge badge-primary badge-sm" title="Token being auctioned">
            {tokenLabel}
          </span>
        )}

        {/* Verified indicator — ENS name resolves to a real address */}
        <span
          className="badge badge-success badge-sm"
          title={`ENS resolves to ${resolvedAddress} — identity verified on-chain`}
        >
          verified
        </span>
      </div>

      {/* Description */}
      {description && (
        <p className="text-sm text-base-content/70 leading-snug max-w-prose">{description}</p>
      )}

      {/* Contact */}
      {contact && (
        <div className="flex items-center gap-1 text-xs text-base-content/50">
          <span className="font-medium text-base-content/70">Contact:</span>
          <span>{contact}</span>
        </div>
      )}
    </div>
  );
}
