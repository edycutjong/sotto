pragma circom 2.1.6;

include "./node_modules/circomlib/circuits/poseidon.circom";
include "./node_modules/circomlib/circuits/comparators.circom";
include "./node_modules/circomlib/circuits/eddsaposeidon.circom";

template LowestBidVerifier(N) {
    // Public Inputs
    signal input maxBudget;
    signal input reservePrice;
    signal input commitments[N];
    signal input winnerIndex;
    signal input winnerAx;   // public: winning bidder BabyJubjub pubkey x
    signal input winnerAy;   // public: winning bidder BabyJubjub pubkey y

    // Private Inputs
    signal input winnerBid;
    signal input winnerSalt;
    signal input competitorBids[N];
    signal input competitorSalts[N];

    // EdDSA-Poseidon signature (private) by the winning bidder.
    signal input sigS;
    signal input sigR8x;
    signal input sigR8y;

    // Check winner bid bounds
    component lowBound = GreaterEqThan(32);
    lowBound.in[0] <== winnerBid;
    lowBound.in[1] <== reservePrice;
    lowBound.out === 1;

    component highBound = LessEqThan(32);
    highBound.in[0] <== winnerBid;
    highBound.in[1] <== maxBudget;
    highBound.out === 1;

    // Loop through all commitments to verify matches and order
    component hashers[N];
    component compareBids[N];
    
    for (var i = 0; i < N; i++) {
        // Compute commitment for each competitor / bidder
        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== competitorBids[i];
        hashers[i].inputs[1] <== competitorSalts[i];
        
        // Assert that the computed commitment matches the public commitment
        hashers[i].out === commitments[i];

        // Assert that winner's bid is lower than or equal to the competitor's bid
        compareBids[i] = LessEqThan(32);
        compareBids[i].in[0] <== winnerBid;
        compareBids[i].in[1] <== competitorBids[i];
        compareBids[i].out === 1;
    }

    // Bind the winning bidder: verify their EdDSA-Poseidon signature over the
    // winner commitment C_w = Poseidon(winnerBid, winnerSalt). (winnerAx,
    // winnerAy) is public so the auction can check the settler is the supplier
    // who placed the winning bid.
    component cwHasher = Poseidon(2);
    cwHasher.inputs[0] <== winnerBid;
    cwHasher.inputs[1] <== winnerSalt;

    component sigVerifier = EdDSAPoseidonVerifier();
    sigVerifier.enabled <== 1;
    sigVerifier.Ax <== winnerAx;
    sigVerifier.Ay <== winnerAy;
    sigVerifier.S <== sigS;
    sigVerifier.R8x <== sigR8x;
    sigVerifier.R8y <== sigR8y;
    sigVerifier.M <== cwHasher.out;
}

component main {public [maxBudget, reservePrice, commitments, winnerIndex, winnerAx, winnerAy]} = LowestBidVerifier(3);
