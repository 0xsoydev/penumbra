// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract PenumbraAuction is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    enum AuctionPhase {
        COMMIT,
        REVEAL,
        ENDED,
        CANCELLED
    }

    struct Auction {
        address seller;
        address tokenAddress;
        uint256 tokenAmount;
        uint256 minimumBid;
        uint256 commitDeadline;
        uint256 revealDeadline;
        address winner;
        uint256 winningBid;
        address winnerStealthAddress;
        bool settled;
        bool cancelled;
    }

    struct Commit {
        bytes32 commitHash;
        bool revealed;
        uint256 revealedAmount;
    }

    uint256 public nextAuctionId;
    mapping(uint256 => Auction) public auctions;
    mapping(uint256 => mapping(address => Commit)) public commits;
    mapping(uint256 => address[]) internal _auctionBidders;

    event AuctionCreated(
        uint256 indexed auctionId, address indexed seller, address tokenAddress, uint256 tokenAmount
    );
    event BidCommitted(uint256 indexed auctionId, address indexed bidder, bytes32 commitHash);
    event BidRevealed(uint256 indexed auctionId, address indexed bidder, uint256 amount);
    event AuctionSettled(
        uint256 indexed auctionId, address indexed winner, uint256 winningBid, address stealthAddress
    );
    event AuctionCancelled(uint256 indexed auctionId);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function createAuction(
        address tokenAddress,
        uint256 tokenAmount,
        uint256 minimumBid,
        uint256 commitDuration,
        uint256 revealDuration
    ) external returns (uint256 auctionId) {
        require(tokenAmount > 0, "Token amount must be > 0");
        require(minimumBid > 0, "Minimum bid must be > 0");
        require(commitDuration > 0, "Commit duration must be > 0");
        require(revealDuration > 0, "Reveal duration must be > 0");

        auctionId = nextAuctionId++;

        IERC20(tokenAddress).safeTransferFrom(msg.sender, address(this), tokenAmount);

        auctions[auctionId] = Auction({
            seller: msg.sender,
            tokenAddress: tokenAddress,
            tokenAmount: tokenAmount,
            minimumBid: minimumBid,
            commitDeadline: block.timestamp + commitDuration,
            revealDeadline: block.timestamp + commitDuration + revealDuration,
            winner: address(0),
            winningBid: 0,
            winnerStealthAddress: address(0),
            settled: false,
            cancelled: false
        });

        emit AuctionCreated(auctionId, msg.sender, tokenAddress, tokenAmount);
    }

    function commitBid(uint256 auctionId, bytes32 commitHash) external {
        Auction storage auction = auctions[auctionId];
        require(!auction.cancelled, "Auction cancelled");
        require(block.timestamp <= auction.commitDeadline, "Commit phase ended");
        require(commits[auctionId][msg.sender].commitHash == bytes32(0), "Already committed");

        commits[auctionId][msg.sender] =
            Commit({commitHash: commitHash, revealed: false, revealedAmount: 0});
        _auctionBidders[auctionId].push(msg.sender);

        emit BidCommitted(auctionId, msg.sender, commitHash);
    }

    function revealBid(uint256 auctionId, uint256 bidAmount, bytes32 salt) external {
        Auction storage auction = auctions[auctionId];
        require(!auction.cancelled, "Auction cancelled");
        require(block.timestamp > auction.commitDeadline, "Commit phase not ended");
        require(block.timestamp <= auction.revealDeadline, "Reveal phase ended");

        Commit storage commit = commits[auctionId][msg.sender];
        require(commit.commitHash != bytes32(0), "No commit found");
        require(!commit.revealed, "Already revealed");
        require(
            commit.commitHash == keccak256(abi.encodePacked(bidAmount, salt)), "Invalid reveal"
        );
        require(bidAmount >= auction.minimumBid, "Below minimum bid");

        commit.revealed = true;
        commit.revealedAmount = bidAmount;

        if (bidAmount > auction.winningBid) {
            auction.winningBid = bidAmount;
            auction.winner = msg.sender;
        }

        emit BidRevealed(auctionId, msg.sender, bidAmount);
    }

    function settle(uint256 auctionId, address winnerStealthAddress)
        external
        onlyOwner
        nonReentrant
    {
        Auction storage auction = auctions[auctionId];
        require(!auction.cancelled, "Auction cancelled");
        require(!auction.settled, "Already settled");
        require(block.timestamp > auction.revealDeadline, "Reveal phase not ended");
        require(auction.winner != address(0), "No winner");
        require(winnerStealthAddress != address(0), "Invalid stealth address");

        auction.settled = true;
        auction.winnerStealthAddress = winnerStealthAddress;

        IERC20(auction.tokenAddress).safeTransfer(winnerStealthAddress, auction.tokenAmount);

        emit AuctionSettled(auctionId, auction.winner, auction.winningBid, winnerStealthAddress);
    }

    function cancelAuction(uint256 auctionId) external nonReentrant {
        Auction storage auction = auctions[auctionId];
        require(
            msg.sender == auction.seller || msg.sender == owner(), "Not authorized"
        );
        require(!auction.settled, "Already settled");
        require(!auction.cancelled, "Already cancelled");

        auction.cancelled = true;

        IERC20(auction.tokenAddress).safeTransfer(auction.seller, auction.tokenAmount);

        emit AuctionCancelled(auctionId);
    }

    function getAuctionPhase(uint256 auctionId) external view returns (AuctionPhase) {
        Auction storage auction = auctions[auctionId];
        if (auction.cancelled) return AuctionPhase.CANCELLED;
        if (block.timestamp <= auction.commitDeadline) return AuctionPhase.COMMIT;
        if (block.timestamp <= auction.revealDeadline) return AuctionPhase.REVEAL;
        return AuctionPhase.ENDED;
    }

    function getAuction(uint256 auctionId) external view returns (Auction memory) {
        return auctions[auctionId];
    }

    function getCommit(uint256 auctionId, address bidder) external view returns (Commit memory) {
        return commits[auctionId][bidder];
    }

    function getAuctionBidders(uint256 auctionId) external view returns (address[] memory) {
        return _auctionBidders[auctionId];
    }
}
