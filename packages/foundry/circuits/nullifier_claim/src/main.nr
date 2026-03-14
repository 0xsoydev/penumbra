// Penumbra ZK Nullifier Claim Circuit
//
// Proves: "I know a secret such that pedersen_hash(secret) == nullifier"
//
// This allows the winner of a sealed-bid auction to claim their tokens
// without revealing their identity. The nullifier was committed on-chain
// during the bid phase, and this proof demonstrates knowledge of the
// preimage (secret) without revealing it.
//
// Public inputs:  nullifier (visible to verifier / on-chain contract)
// Private inputs: secret (known only to the prover / bidder)

fn main(
    secret: Field,          // PRIVATE: the bidder's secret (never revealed)
    nullifier: pub Field,   // PUBLIC: must match the winning nullifier on-chain
) {
    // Compute the nullifier from the secret using Pedersen hash
    // Pedersen is ZK-friendly (cheap in circuits) and deterministic
    let computed_nullifier = std::hash::pedersen_hash([secret]);

    // Assert the computed nullifier matches the public input
    assert(computed_nullifier == nullifier);
}

#[test]
fn test_valid_claim() {
    // A known secret
    let secret = 12345;

    // Compute what the nullifier should be
    let nullifier = std::hash::pedersen_hash([secret]);

    // This should pass - prover knows the correct secret
    main(secret, nullifier);
}

#[test(should_fail)]
fn test_invalid_claim() {
    // Wrong secret should fail
    let wrong_secret = 99999;
    let real_secret = 12345;

    // Nullifier was generated from real_secret
    let nullifier = std::hash::pedersen_hash([real_secret]);

    // This should fail - prover doesn't know the correct secret
    main(wrong_secret, nullifier);
}
