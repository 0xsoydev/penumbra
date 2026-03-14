// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../contracts/PenumbraToken.sol";
import "../contracts/PenumbraAuction.sol";

contract PenumbraAuctionTest is Test {
    PenumbraToken token;
    PenumbraAuction auction;

    address owner = address(this);
    address seller = makeAddr("seller");
    address bidder1 = makeAddr("bidder1");
    address bidder2 = makeAddr("bidder2");
    address bidder3 = makeAddr("bidder3");
    address stealthAddr = makeAddr("stealth");

    uint256 constant TOKEN_AMOUNT = 1000 ether;
    uint256 constant MINIMUM_BID = 0.1 ether;
    uint256 constant COMMIT_DURATION = 1 hours;
    uint256 constant REVEAL_DURATION = 1 hours;

    function setUp() public {
        token = new PenumbraToken(owner);
        auction = new PenumbraAuction(owner);

        token.transfer(seller, TOKEN_AMOUNT);
    }

    function _createAuction() internal returns (uint256 auctionId) {
        vm.startPrank(seller);
        token.approve(address(auction), TOKEN_AMOUNT);
        auctionId =
            auction.createAuction(address(token), TOKEN_AMOUNT, MINIMUM_BID, COMMIT_DURATION, REVEAL_DURATION);
        vm.stopPrank();
    }

    function _commitHash(uint256 bidAmount, bytes32 salt) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(bidAmount, salt));
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
            auction.createAuction(address(token), TOKEN_AMOUNT, MINIMUM_BID, COMMIT_DURATION, REVEAL_DURATION);
        vm.stopPrank();

        assertEq(auctionId, 0);
        assertEq(auction.nextAuctionId(), 1);

        PenumbraAuction.Auction memory a = auction.getAuction(auctionId);
        assertEq(a.seller, seller);
        assertEq(a.tokenAddress, address(token));
        assertEq(a.tokenAmount, TOKEN_AMOUNT);
        assertEq(a.minimumBid, MINIMUM_BID);
        assertEq(a.commitDeadline, block.timestamp + COMMIT_DURATION);
        assertEq(a.revealDeadline, block.timestamp + COMMIT_DURATION + REVEAL_DURATION);
        assertEq(a.winner, address(0));
        assertEq(a.winningBid, 0);
        assertFalse(a.settled);
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
        auction.createAuction(address(token), 0, MINIMUM_BID, COMMIT_DURATION, REVEAL_DURATION);
        vm.stopPrank();
    }

    // =========================================================================
    // Test 3: commitBid success
    // =========================================================================

    function test_CommitBid_Success() public {
        uint256 auctionId = _createAuction();

        uint256 bidAmount = 1 ether;
        bytes32 salt = bytes32(uint256(123));
        bytes32 hash = _commitHash(bidAmount, salt);

        vm.expectEmit(true, true, false, true);
        emit PenumbraAuction.BidCommitted(auctionId, bidder1, hash);

        vm.prank(bidder1);
        auction.commitBid(auctionId, hash);

        PenumbraAuction.Commit memory c = auction.getCommit(auctionId, bidder1);
        assertEq(c.commitHash, hash);
        assertFalse(c.revealed);
        assertEq(c.revealedAmount, 0);

        address[] memory bidders = auction.getAuctionBidders(auctionId);
        assertEq(bidders.length, 1);
        assertEq(bidders[0], bidder1);
    }

    // =========================================================================
    // Test 4: commitBid reverts after deadline
    // =========================================================================

    function test_CommitBid_RevertsAfterDeadline() public {
        uint256 auctionId = _createAuction();

        vm.warp(block.timestamp + COMMIT_DURATION + 1);

        bytes32 hash = _commitHash(1 ether, bytes32(uint256(1)));
        vm.prank(bidder1);
        vm.expectRevert("Commit phase ended");
        auction.commitBid(auctionId, hash);
    }

    // =========================================================================
    // Test 5: commitBid reverts on duplicate
    // =========================================================================

    function test_CommitBid_RevertsDuplicate() public {
        uint256 auctionId = _createAuction();

        bytes32 hash = _commitHash(1 ether, bytes32(uint256(1)));

        vm.prank(bidder1);
        auction.commitBid(auctionId, hash);

        vm.prank(bidder1);
        vm.expectRevert("Already committed");
        auction.commitBid(auctionId, hash);
    }

    // =========================================================================
    // Test 6: revealBid success
    // =========================================================================

    function test_RevealBid_Success() public {
        uint256 auctionId = _createAuction();

        uint256 bidAmount = 1 ether;
        bytes32 salt = bytes32(uint256(42));
        bytes32 hash = _commitHash(bidAmount, salt);

        vm.prank(bidder1);
        auction.commitBid(auctionId, hash);

        vm.warp(block.timestamp + COMMIT_DURATION + 1);

        vm.expectEmit(true, true, false, true);
        emit PenumbraAuction.BidRevealed(auctionId, bidder1, bidAmount);

        vm.prank(bidder1);
        auction.revealBid(auctionId, bidAmount, salt);

        PenumbraAuction.Commit memory c = auction.getCommit(auctionId, bidder1);
        assertTrue(c.revealed);
        assertEq(c.revealedAmount, bidAmount);

        PenumbraAuction.Auction memory a = auction.getAuction(auctionId);
        assertEq(a.winner, bidder1);
        assertEq(a.winningBid, bidAmount);
    }

    // =========================================================================
    // Test 7: revealBid reverts with invalid hash
    // =========================================================================

    function test_RevealBid_RevertsInvalidHash() public {
        uint256 auctionId = _createAuction();

        uint256 bidAmount = 1 ether;
        bytes32 salt = bytes32(uint256(42));
        bytes32 hash = _commitHash(bidAmount, salt);

        vm.prank(bidder1);
        auction.commitBid(auctionId, hash);

        vm.warp(block.timestamp + COMMIT_DURATION + 1);

        vm.prank(bidder1);
        vm.expectRevert("Invalid reveal");
        auction.revealBid(auctionId, 2 ether, salt);

        vm.prank(bidder1);
        vm.expectRevert("Invalid reveal");
        auction.revealBid(auctionId, bidAmount, bytes32(uint256(999)));
    }

    // =========================================================================
    // Test 8: revealBid reverts below minimum bid
    // =========================================================================

    function test_RevealBid_RevertsBelowMinimum() public {
        uint256 auctionId = _createAuction();

        uint256 bidAmount = MINIMUM_BID - 1;
        bytes32 salt = bytes32(uint256(7));
        bytes32 hash = _commitHash(bidAmount, salt);

        vm.prank(bidder1);
        auction.commitBid(auctionId, hash);

        vm.warp(block.timestamp + COMMIT_DURATION + 1);

        vm.prank(bidder1);
        vm.expectRevert("Below minimum bid");
        auction.revealBid(auctionId, bidAmount, salt);
    }

    // =========================================================================
    // Test 9: multiple bidders — highest wins
    // =========================================================================

    function test_RevealBid_MultipleWinnerIsHighest() public {
        uint256 auctionId = _createAuction();

        uint256 bid1 = 1 ether;
        uint256 bid2 = 3 ether;
        uint256 bid3 = 2 ether;
        bytes32 salt1 = bytes32(uint256(11));
        bytes32 salt2 = bytes32(uint256(22));
        bytes32 salt3 = bytes32(uint256(33));

        vm.prank(bidder1);
        auction.commitBid(auctionId, _commitHash(bid1, salt1));
        vm.prank(bidder2);
        auction.commitBid(auctionId, _commitHash(bid2, salt2));
        vm.prank(bidder3);
        auction.commitBid(auctionId, _commitHash(bid3, salt3));

        vm.warp(block.timestamp + COMMIT_DURATION + 1);

        vm.prank(bidder1);
        auction.revealBid(auctionId, bid1, salt1);
        vm.prank(bidder2);
        auction.revealBid(auctionId, bid2, salt2);
        vm.prank(bidder3);
        auction.revealBid(auctionId, bid3, salt3);

        PenumbraAuction.Auction memory a = auction.getAuction(auctionId);
        assertEq(a.winner, bidder2, "bidder2 should win with highest bid");
        assertEq(a.winningBid, bid2);

        address[] memory bidders = auction.getAuctionBidders(auctionId);
        assertEq(bidders.length, 3);
    }

    // =========================================================================
    // Test 10: settle transfers tokens to stealth address
    // =========================================================================

    function test_Settle_TransfersTokensToStealth() public {
        uint256 auctionId = _createAuction();

        uint256 bidAmount = 1 ether;
        bytes32 salt = bytes32(uint256(100));

        vm.prank(bidder1);
        auction.commitBid(auctionId, _commitHash(bidAmount, salt));

        vm.warp(block.timestamp + COMMIT_DURATION + 1);

        vm.prank(bidder1);
        auction.revealBid(auctionId, bidAmount, salt);

        vm.warp(block.timestamp + REVEAL_DURATION + 1);

        vm.expectEmit(true, true, false, true);
        emit PenumbraAuction.AuctionSettled(auctionId, bidder1, bidAmount, stealthAddr);

        auction.settle(auctionId, stealthAddr);

        assertEq(token.balanceOf(stealthAddr), TOKEN_AMOUNT);
        assertEq(token.balanceOf(address(auction)), 0);

        PenumbraAuction.Auction memory a = auction.getAuction(auctionId);
        assertTrue(a.settled);
        assertEq(a.winnerStealthAddress, stealthAddr);
    }

    // =========================================================================
    // Test 11: settle reverts if no winner
    // =========================================================================

    function test_Settle_RevertsIfNoWinner() public {
        uint256 auctionId = _createAuction();

        vm.warp(block.timestamp + COMMIT_DURATION + REVEAL_DURATION + 1);

        vm.expectRevert("No winner");
        auction.settle(auctionId, stealthAddr);
    }

    // =========================================================================
    // Test 12: settle reverts if not owner
    // =========================================================================

    function test_Settle_RevertsIfNotOwner() public {
        uint256 auctionId = _createAuction();

        uint256 bidAmount = 1 ether;
        bytes32 salt = bytes32(uint256(50));

        vm.prank(bidder1);
        auction.commitBid(auctionId, _commitHash(bidAmount, salt));

        vm.warp(block.timestamp + COMMIT_DURATION + 1);

        vm.prank(bidder1);
        auction.revealBid(auctionId, bidAmount, salt);

        vm.warp(block.timestamp + REVEAL_DURATION + 1);

        vm.prank(bidder1);
        vm.expectRevert();
        auction.settle(auctionId, stealthAddr);
    }

    // =========================================================================
    // Test 13: cancelAuction refunds seller
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
}
