export enum AuctionPhase {
  COMMIT = 0,
  SETTLE = 1,
  ENDED = 2,
  CANCELLED = 3,
}

export type AuctionData = {
  seller: string;
  tokenAddress: string;
  tokenAmount: bigint;
  minimumBid: bigint;
  commitDeadline: bigint;
  settleDeadline: bigint;
  winningNullifier: string; // bytes32 hex
  claimed: boolean;
  cancelled: boolean;
};

export type CommitData = {
  commitHash: string;
  exists: boolean;
};

export type StoredBid = {
  auctionId: number;
  bidAmount: string;
  salt: string;
  secret: string;
  nullifier: string;
  committed: boolean;
  revealed: boolean;
};

export type DepositInfo = {
  bidderAddress: string;
  depositAddress: string;
  amountWei: string;
  confirmed: boolean;
};

export type AuctionStatusResponse = {
  auction: {
    id: number;
    sellerAddress: string;
    ensName: string | null;
    docCid: string | null;
    createdAt: string;
  };
  onChain: {
    phase: string;
    commitDeadline: string;
    settleDeadline: string;
    winnerDeclared: boolean;
    claimed: boolean;
    cancelled: boolean;
    bidCount: number | null;
  } | null;
  deposits: {
    total: number;
    committed: number;
    confirmed: number;
  };
  payout?: {
    paid: boolean;
    bitgoTxId: string | null;
    winningBidWei: string | null;
  };
};

export type StealthAnnouncement = {
  id: number;
  recipientAddress: string;
  ephemeralPublicKey: string;
  stealthAddress: string;
  auctionId: number;
};

export const PHASE_LABELS: Record<AuctionPhase, string> = {
  [AuctionPhase.COMMIT]: "Commit Phase",
  [AuctionPhase.SETTLE]: "Settle Phase",
  [AuctionPhase.ENDED]: "Ended",
  [AuctionPhase.CANCELLED]: "Cancelled",
};

export const PHASE_COLORS: Record<AuctionPhase, string> = {
  [AuctionPhase.COMMIT]: "badge-primary",
  [AuctionPhase.SETTLE]: "badge-warning",
  [AuctionPhase.ENDED]: "badge-success",
  [AuctionPhase.CANCELLED]: "badge-error",
};

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
