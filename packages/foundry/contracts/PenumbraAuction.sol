// SPDX-License-Identifier: MIT
pragma solidity >=0.8.21;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./NullifierVerifier.sol";

/// @title PenumbraAuction - Full-Privacy Sealed-Bid Auction with ZK Claims
/// @notice Nullifier-based auction where bidder identities and bid amounts
///         are never revealed on-chain. Winner claims tokens via ZK proof.
/// @dev Privacy properties:
///   - Bidder addresses: HIDDEN (backend relays commits, keyed by nullifier)
///   - Winner address: HIDDEN (claims from burner wallet via ZK proof)
///   - Bid amounts: HIDDEN (no on-chain reveal; backend determines winner off-chain)
///   - Winner receives tokens at stealth address (unlinkable to real wallet)
contract PenumbraAuction is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    enum AuctionPhase {
        COMMIT,
        SETTLE,   // renamed from REVEAL - backend settles off-chain
        ENDED,
        CANCELLED
    }

    struct Auction {
        address seller;
        address tokenAddress;
        uint256 tokenAmount;
        uint256 minimumBid;
        uint256 commitDeadline;
        uint256 settleDeadline;     // renamed from revealDeadline
        bytes32 winningNullifier;   // replaces address winner
        bool claimed;               // replaces settled
        bool cancelled;
        // NO winner address
        // NO winningBid amount
        // NO winnerStealthAddress
    }

    /// @notice Commit data keyed by nullifier (NOT by address)
    struct Commit {
        bytes32 commitHash;
        bool exists;
    }

    /// @notice The ZK proof verifier contract (Barretenberg HonkVerifier)
    IVerifier public immutable verifier;

    uint256 public nextAuctionId;

    /// @notice Auction data
    mapping(uint256 => Auction) public auctions;

    /// @notice Commits keyed by auctionId => nullifier => Commit
    /// @dev No address mapping - privacy preserved
    mapping(uint256 => mapping(bytes32 => Commit)) public commits;

    /// @notice Track nullifiers per auction (for commit count, not enumerable by design)
    mapping(uint256 => uint256) public commitCount;

    /// @notice Prevent nullifier reuse across auctions
    mapping(bytes32 => bool) public usedNullifiers;

    // ─── Events (privacy-preserving) ────────────────────────────────

    /// @notice Emitted when an auction is created (seller is known - they list publicly)
    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed seller,
        address tokenAddress,
        uint256 tokenAmount
    );

    /// @notice Emitted when a bid is committed - only nullifier visible, NO address, NO amount
    event BidCommitted(uint256 indexed auctionId, bytes32 indexed nullifier);

    /// @notice Emitted when the winning nullifier is declared by the backend
    event WinnerDeclared(uint256 indexed auctionId, bytes32 indexed winningNullifier);

    /// @notice Emitted when the winner claims tokens via ZK proof
    /// @dev Only stealth address visible - can't be linked to real wallet
    event AuctionClaimed(uint256 indexed auctionId, address stealthAddress);

    event AuctionCancelled(uint256 indexed auctionId);

    // ─── Constructor ────────────────────────────────────────────────

    constructor(address initialOwner, address _verifier) Ownable(initialOwner) {
        require(_verifier != address(0), "Invalid verifier address");
        verifier = IVerifier(_verifier);
    }

    // ─── Auction Lifecycle ──────────────────────────────────────────

    /// @notice Create a new auction (seller locks tokens)
    function createAuction(
        address tokenAddress,
        uint256 tokenAmount,
        uint256 minimumBid,
        uint256 commitDuration,
        uint256 settleDuration
    ) external returns (uint256 auctionId) {
        require(tokenAmount > 0, "Token amount must be > 0");
        require(minimumBid > 0, "Minimum bid must be > 0");
        require(commitDuration > 0, "Commit duration must be > 0");
        require(settleDuration > 0, "Settle duration must be > 0");

        auctionId = nextAuctionId++;

        IERC20(tokenAddress).safeTransferFrom(msg.sender, address(this), tokenAmount);

        auctions[auctionId] = Auction({
            seller: msg.sender,
            tokenAddress: tokenAddress,
            tokenAmount: tokenAmount,
            minimumBid: minimumBid,
            commitDeadline: block.timestamp + commitDuration,
            settleDeadline: block.timestamp + commitDuration + settleDuration,
            winningNullifier: bytes32(0),
            claimed: false,
            cancelled: false
        });

        emit AuctionCreated(auctionId, msg.sender, tokenAddress, tokenAmount);
    }

    /// @notice Submit a sealed bid commitment using a nullifier (NOT msg.sender)
    /// @dev Backend relays this transaction - bidder's real address never touches contract.
    ///      commitHash = keccak256(abi.encodePacked(bidAmount, salt, nullifier))
    ///      nullifier = pedersen_hash(secret) -- computed off-chain
    /// @param auctionId The auction to bid on
    /// @param nullifier The bidder's nullifier (pedersen hash of their secret)
    /// @param commitHash Hash of (bidAmount, salt, nullifier)
    function commitBid(
        uint256 auctionId,
        bytes32 nullifier,
        bytes32 commitHash
    ) external {
        Auction storage auction = auctions[auctionId];
        require(!auction.cancelled, "Auction cancelled");
        require(block.timestamp <= auction.commitDeadline, "Commit phase ended");
        require(nullifier != bytes32(0), "Invalid nullifier");
        require(commitHash != bytes32(0), "Invalid commit hash");
        require(!commits[auctionId][nullifier].exists, "Nullifier already used in this auction");
        require(!usedNullifiers[nullifier], "Nullifier already used globally");

        commits[auctionId][nullifier] = Commit({
            commitHash: commitHash,
            exists: true
        });
        commitCount[auctionId]++;

        // Mark nullifier as used globally to prevent reuse
        usedNullifiers[nullifier] = true;

        emit BidCommitted(auctionId, nullifier);
    }

    /// @notice Backend declares the winning nullifier after off-chain reveal
    /// @dev Backend receives bid amounts off-chain, verifies commit hashes,
    ///      determines the highest bid, and posts only the winning nullifier.
    ///      NO bid amounts are ever posted on-chain.
    /// @param auctionId The auction ID
    /// @param winningNullifier The nullifier of the highest bidder
    function declareWinner(
        uint256 auctionId,
        bytes32 winningNullifier
    ) external onlyOwner {
        Auction storage auction = auctions[auctionId];
        require(!auction.cancelled, "Auction cancelled");
        require(!auction.claimed, "Already claimed");
        require(block.timestamp > auction.commitDeadline, "Commit phase not ended");
        require(auction.winningNullifier == bytes32(0), "Winner already declared");
        require(commits[auctionId][winningNullifier].exists, "Nullifier not found in auction");

        auction.winningNullifier = winningNullifier;

        emit WinnerDeclared(auctionId, winningNullifier);
    }

    /// @notice Winner claims tokens with a ZK proof (PERMISSIONLESS)
    /// @dev Anyone can call this from any address (e.g., a burner wallet).
    ///      The ZK proof proves knowledge of the secret behind the winning nullifier.
    ///      Tokens are sent to the provided stealth address.
    ///      msg.sender is irrelevant - only the proof matters.
    /// @param auctionId The auction ID
    /// @param proof The ZK proof (generated by Barretenberg)
    /// @param stealthAddress Where to send the won tokens
    function claimWithProof(
        uint256 auctionId,
        bytes calldata proof,
        address stealthAddress
    ) external nonReentrant {
        Auction storage auction = auctions[auctionId];
        require(!auction.cancelled, "Auction cancelled");
        require(!auction.claimed, "Already claimed");
        require(auction.winningNullifier != bytes32(0), "No winner declared");
        require(stealthAddress != address(0), "Invalid stealth address");

        // Prepare public inputs for the verifier
        // The circuit has one public input: the nullifier
        bytes32[] memory publicInputs = new bytes32[](1);
        publicInputs[0] = auction.winningNullifier;

        // Verify the ZK proof on-chain
        // This proves: "I know a secret such that pedersen_hash(secret) == winningNullifier"
        bool isValid = verifier.verify(proof, publicInputs);
        require(isValid, "Invalid ZK proof");

        // Transfer tokens to stealth address
        auction.claimed = true;
        IERC20(auction.tokenAddress).safeTransfer(stealthAddress, auction.tokenAmount);

        emit AuctionClaimed(auctionId, stealthAddress);
    }

    /// @notice Cancel an auction and return tokens to seller
    function cancelAuction(uint256 auctionId) external nonReentrant {
        Auction storage auction = auctions[auctionId];
        require(
            msg.sender == auction.seller || msg.sender == owner(),
            "Not authorized"
        );
        require(!auction.claimed, "Already claimed");
        require(!auction.cancelled, "Already cancelled");

        auction.cancelled = true;

        IERC20(auction.tokenAddress).safeTransfer(auction.seller, auction.tokenAmount);

        emit AuctionCancelled(auctionId);
    }

    // ─── View Functions ─────────────────────────────────────────────

    function getAuctionPhase(uint256 auctionId) external view returns (AuctionPhase) {
        Auction storage auction = auctions[auctionId];
        if (auction.cancelled) return AuctionPhase.CANCELLED;
        if (block.timestamp <= auction.commitDeadline) return AuctionPhase.COMMIT;
        if (block.timestamp <= auction.settleDeadline) return AuctionPhase.SETTLE;
        return AuctionPhase.ENDED;
    }

    function getAuction(uint256 auctionId) external view returns (Auction memory) {
        return auctions[auctionId];
    }

    function getCommit(uint256 auctionId, bytes32 nullifier) external view returns (Commit memory) {
        return commits[auctionId][nullifier];
    }

    function getCommitCount(uint256 auctionId) external view returns (uint256) {
        return commitCount[auctionId];
    }

    // NOTE: No getAuctionBidders() function - bidder addresses are never stored
}
