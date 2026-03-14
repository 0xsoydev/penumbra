export enum AuctionPhase {
  COMMIT = 0,
  REVEAL = 1,
  ENDED = 2,
  CANCELLED = 3,
}

export type AuctionData = {
  seller: string;
  tokenAddress: string;
  tokenAmount: bigint;
  minimumBid: bigint;
  commitDeadline: bigint;
  revealDeadline: bigint;
  winner: string;
  winningBid: bigint;
  winnerStealthAddress: string;
  settled: boolean;
  cancelled: boolean;
};

export type CommitData = {
  commitHash: string;
  revealed: boolean;
  revealedAmount: bigint;
};

export type StoredBid = {
  auctionId: number;
  bidAmount: string;
  salt: string;
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
  deposits: DepositInfo[];
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
  [AuctionPhase.REVEAL]: "Reveal Phase",
  [AuctionPhase.ENDED]: "Ended",
  [AuctionPhase.CANCELLED]: "Cancelled",
};

export const PHASE_COLORS: Record<AuctionPhase, string> = {
  [AuctionPhase.COMMIT]: "badge-primary",
  [AuctionPhase.REVEAL]: "badge-warning",
  [AuctionPhase.ENDED]: "badge-success",
  [AuctionPhase.CANCELLED]: "badge-error",
};

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
