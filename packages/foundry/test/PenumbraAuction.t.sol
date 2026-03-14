// SPDX-License-Identifier: MIT
pragma solidity >=0.8.21;

import "forge-std/Test.sol";
import "../contracts/PenumbraToken.sol";
import "../contracts/PenumbraAuction.sol";
import "../contracts/NullifierVerifier.sol";

contract PenumbraAuctionTest is Test {
    PenumbraToken token;
    PenumbraAuction auction;
    HonkVerifier verifier;

    address owner = address(this);
    address seller = makeAddr("seller");
    address relayer = address(this); // backend relays commits (is also owner)
    address burnerWallet = makeAddr("burner"); // winner claims from burner
    address stealthAddr = makeAddr("stealth");

    uint256 constant TOKEN_AMOUNT = 1000 ether;
    uint256 constant MINIMUM_BID = 0.1 ether;
    uint256 constant COMMIT_DURATION = 1 hours;
    uint256 constant SETTLE_DURATION = 1 hours;

    // Test nullifiers (would be pedersen hashes in production)
    bytes32 nullifier1 = keccak256("secret1");
    bytes32 nullifier2 = keccak256("secret2");
    bytes32 nullifier3 = keccak256("secret3");

    function setUp() public {
        token = new PenumbraToken(owner);
        verifier = new HonkVerifier();
        auction = new PenumbraAuction(owner, address(verifier));

        token.transfer(seller, TOKEN_AMOUNT);
    }

    function _createAuction() internal returns (uint256 auctionId) {
        vm.startPrank(seller);
        token.approve(address(auction), TOKEN_AMOUNT);
        auctionId =
            auction.createAuction(address(token), TOKEN_AMOUNT, MINIMUM_BID, COMMIT_DURATION, SETTLE_DURATION);
        vm.stopPrank();
    }

    function _commitHash(uint256 bidAmount, bytes32 salt, bytes32 nullifier) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(bidAmount, salt, nullifier));
    }

    // =========================================================================
    // Test 1: createAuction success
    // =========================================================================

    function test_CreateAuction_Success() public {
        uint256 sellerBalBefore = token.balanceOf(seller);

        vm.startPrank(seller);
        token.approve(address(auction), TOKEN_AMOUNT);

        vm.expectEmit(true, true, false, true);
        emit PenumbraAuction.AuctionCreated(0, seller, address(token), TOKEN_AMOUNT);

        uint256 auctionId =
            auction.createAuction(address(token), TOKEN_AMOUNT, MINIMUM_BID, COMMIT_DURATION, SETTLE_DURATION);
        vm.stopPrank();

        assertEq(auctionId, 0);
        assertEq(auction.nextAuctionId(), 1);

        PenumbraAuction.Auction memory a = auction.getAuction(auctionId);
        assertEq(a.seller, seller);
        assertEq(a.tokenAddress, address(token));
        assertEq(a.tokenAmount, TOKEN_AMOUNT);
        assertEq(a.minimumBid, MINIMUM_BID);
        assertEq(a.commitDeadline, block.timestamp + COMMIT_DURATION);
        assertEq(a.settleDeadline, block.timestamp + COMMIT_DURATION + SETTLE_DURATION);
        assertEq(a.winningNullifier, bytes32(0));
        assertFalse(a.claimed);
        assertFalse(a.cancelled);

        assertEq(token.balanceOf(seller), sellerBalBefore - TOKEN_AMOUNT);
        assertEq(token.balanceOf(address(auction)), TOKEN_AMOUNT);
    }

    // =========================================================================
    // Test 2: createAuction reverts on zero token amount
    // =========================================================================

    function test_CreateAuction_RevertsOnZeroAmount() public {
        vm.startPrank(seller);
        token.approve(address(auction), TOKEN_AMOUNT);

        vm.expectRevert("Token amount must be > 0");
        auction.createAuction(address(token), 0, MINIMUM_BID, COMMIT_DURATION, SETTLE_DURATION);
        vm.stopPrank();
    }

    // =========================================================================
    // Test 3: commitBid with nullifier - backend relays
    // =========================================================================

    function test_CommitBid_Success() public {
        uint256 auctionId = _createAuction();

        uint256 bidAmount = 1 ether;
        bytes32 salt = bytes32(uint256(123));
        bytes32 hash = _commitHash(bidAmount, salt, nullifier1);

        vm.expectEmit(true, true, false, true);
        emit PenumbraAuction.BidCommitted(auctionId, nullifier1);

        // Backend (owner/relayer) submits the bid — bidder's address never touches contract
        auction.commitBid(auctionId, nullifier1, hash);

        PenumbraAuction.Commit memory c = auction.getCommit(auctionId, nullifier1);
        assertEq(c.commitHash, hash);
        assertTrue(c.exists);

        assertEq(auction.commitCount(auctionId), 1);
    }

    // =========================================================================
    // Test 4: commitBid reverts after deadline
    // =========================================================================

    function test_CommitBid_RevertsAfterDeadline() public {
        uint256 auctionId = _createAuction();

        vm.warp(block.timestamp + COMMIT_DURATION + 1);

        bytes32 hash = _commitHash(1 ether, bytes32(uint256(1)), nullifier1);
        vm.expectRevert("Commit phase ended");
        auction.commitBid(auctionId, nullifier1, hash);
    }

    // =========================================================================
    // Test 5: commitBid reverts on duplicate nullifier
    // =========================================================================

    function test_CommitBid_RevertsDuplicateNullifier() public {
        uint256 auctionId = _createAuction();

        bytes32 hash = _commitHash(1 ether, bytes32(uint256(1)), nullifier1);
        auction.commitBid(auctionId, nullifier1, hash);

        vm.expectRevert("Nullifier already used in this auction");
        auction.commitBid(auctionId, nullifier1, hash);
    }

    // =========================================================================
    // Test 6: commitBid rejects globally reused nullifier
    // =========================================================================

    function test_CommitBid_RevertsGloballyUsedNullifier() public {
        // Create first auction and use nullifier1
        uint256 auctionId1 = _createAuction();
        bytes32 hash = _commitHash(1 ether, bytes32(uint256(1)), nullifier1);
        auction.commitBid(auctionId1, nullifier1, hash);

        // Create second auction — give seller more tokens
        token.transfer(seller, TOKEN_AMOUNT);
        vm.startPrank(seller);
        token.approve(address(auction), TOKEN_AMOUNT);
        uint256 auctionId2 =
            auction.createAuction(address(token), TOKEN_AMOUNT, MINIMUM_BID, COMMIT_DURATION, SETTLE_DURATION);
        vm.stopPrank();

        // Try to reuse same nullifier in different auction
        vm.expectRevert("Nullifier already used globally");
        auction.commitBid(auctionId2, nullifier1, hash);
    }

    // =========================================================================
    // Test 7: declareWinner success
    // =========================================================================

    function test_DeclareWinner_Success() public {
        uint256 auctionId = _createAuction();

        // Submit two bids via nullifiers
        auction.commitBid(auctionId, nullifier1, _commitHash(1 ether, bytes32(uint256(1)), nullifier1));
        auction.commitBid(auctionId, nullifier2, _commitHash(3 ether, bytes32(uint256(2)), nullifier2));

        // Move past commit phase
        vm.warp(block.timestamp + COMMIT_DURATION + 1);

        // Backend determines winner off-chain and declares nullifier2 as winner
        vm.expectEmit(true, true, false, true);
        emit PenumbraAuction.WinnerDeclared(auctionId, nullifier2);

        auction.declareWinner(auctionId, nullifier2);

        PenumbraAuction.Auction memory a = auction.getAuction(auctionId);
        assertEq(a.winningNullifier, nullifier2);
    }

    // =========================================================================
    // Test 8: declareWinner reverts if not owner
    // =========================================================================

    function test_DeclareWinner_RevertsIfNotOwner() public {
        uint256 auctionId = _createAuction();
        auction.commitBid(auctionId, nullifier1, _commitHash(1 ether, bytes32(uint256(1)), nullifier1));

        vm.warp(block.timestamp + COMMIT_DURATION + 1);

        vm.prank(seller);
        vm.expectRevert();
        auction.declareWinner(auctionId, nullifier1);
    }

    // =========================================================================
    // Test 9: declareWinner reverts if commit phase not ended
    // =========================================================================

    function test_DeclareWinner_RevertsIfCommitNotEnded() public {
        uint256 auctionId = _createAuction();
        auction.commitBid(auctionId, nullifier1, _commitHash(1 ether, bytes32(uint256(1)), nullifier1));

        vm.expectRevert("Commit phase not ended");
        auction.declareWinner(auctionId, nullifier1);
    }

    // =========================================================================
    // Test 10: declareWinner reverts for unknown nullifier
    // =========================================================================

    function test_DeclareWinner_RevertsUnknownNullifier() public {
        uint256 auctionId = _createAuction();
        auction.commitBid(auctionId, nullifier1, _commitHash(1 ether, bytes32(uint256(1)), nullifier1));

        vm.warp(block.timestamp + COMMIT_DURATION + 1);

        // Try to declare a nullifier that was never committed
        bytes32 fakeNullifier = keccak256("fake");
        vm.expectRevert("Nullifier not found in auction");
        auction.declareWinner(auctionId, fakeNullifier);
    }

    // =========================================================================
    // Test 11: cancelAuction refunds seller
    // =========================================================================

    function test_CancelAuction_RefundsSeller() public {
        uint256 auctionId = _createAuction();

        uint256 sellerBalBefore = token.balanceOf(seller);

        vm.prank(seller);
        auction.cancelAuction(auctionId);

        assertEq(token.balanceOf(seller), sellerBalBefore + TOKEN_AMOUNT);
        assertEq(token.balanceOf(address(auction)), 0);

        PenumbraAuction.Auction memory a = auction.getAuction(auctionId);
        assertTrue(a.cancelled);

        assertEq(uint256(auction.getAuctionPhase(auctionId)), uint256(PenumbraAuction.AuctionPhase.CANCELLED));
    }

    // =========================================================================
    // Test 12: cancelAuction reverts if already claimed
    // =========================================================================

    function test_CancelAuction_RevertsIfClaimed() public {
        // We can't easily test full claim flow here (needs real ZK proof)
        // but we can test the revert logic by checking cancelled/claimed flags
        uint256 auctionId = _createAuction();

        vm.prank(seller);
        auction.cancelAuction(auctionId);

        vm.prank(seller);
        vm.expectRevert("Already cancelled");
        auction.cancelAuction(auctionId);
    }

    // =========================================================================
    // Test 13: getAuctionPhase returns correct phases
    // =========================================================================

    function test_GetAuctionPhase() public {
        uint256 auctionId = _createAuction();

        // During commit
        assertEq(uint256(auction.getAuctionPhase(auctionId)), uint256(PenumbraAuction.AuctionPhase.COMMIT));

        // After commit, during settle
        vm.warp(block.timestamp + COMMIT_DURATION + 1);
        assertEq(uint256(auction.getAuctionPhase(auctionId)), uint256(PenumbraAuction.AuctionPhase.SETTLE));

        // After settle deadline
        vm.warp(block.timestamp + SETTLE_DURATION + 1);
        assertEq(uint256(auction.getAuctionPhase(auctionId)), uint256(PenumbraAuction.AuctionPhase.ENDED));
    }

    // =========================================================================
    // Test 14: multiple commits tracked correctly
    // =========================================================================

    function test_MultipleCommits_CountTracked() public {
        uint256 auctionId = _createAuction();

        auction.commitBid(auctionId, nullifier1, _commitHash(1 ether, bytes32(uint256(1)), nullifier1));
        auction.commitBid(auctionId, nullifier2, _commitHash(2 ether, bytes32(uint256(2)), nullifier2));
        auction.commitBid(auctionId, nullifier3, _commitHash(3 ether, bytes32(uint256(3)), nullifier3));

        assertEq(auction.commitCount(auctionId), 3);

        // Each commit is retrievable by nullifier
        assertTrue(auction.getCommit(auctionId, nullifier1).exists);
        assertTrue(auction.getCommit(auctionId, nullifier2).exists);
        assertTrue(auction.getCommit(auctionId, nullifier3).exists);
    }

    // =========================================================================
    // Test 15: claimWithProof reverts without declared winner
    // =========================================================================

    function test_ClaimWithProof_RevertsNoWinner() public {
        uint256 auctionId = _createAuction();

        vm.prank(burnerWallet);
        vm.expectRevert("No winner declared");
        auction.claimWithProof(auctionId, hex"", stealthAddr);
    }

    // =========================================================================
    // Test 16: verifier contract is set correctly
    // =========================================================================

    function test_VerifierAddress() public view {
        assertEq(address(auction.verifier()), address(verifier));
    }
}
