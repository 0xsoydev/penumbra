export enum AuctionPhase {
  COMMIT = 0,
  REVEAL = 1,
  ENDED = 2,
  CANCELLED = 3,
}

export type StealthKeys = {
  spendingPubKey: string;
  viewingPubKey: string;
  isRegistered: boolean;
  register: () => Promise<void>;
};

export type AuctionPhaseData = {
  phase: AuctionPhase;
  timeRemaining: number; // seconds until next phase transition
};

export type BidCommitData = {
  commitHash: `0x${string}` | null;
  generateCommit: (amount: bigint) => void;
  salt: `0x${string}` | null;
  clearSalt: () => void;
};

export type BitGoDepositData = {
  depositAddress: string | null;
  confirmed: boolean;
  amount: string; // wei string
};
