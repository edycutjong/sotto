pragma circom 2.1.6;

include "./node_modules/circomlib/circuits/poseidon.circom";

// Helper: derive the public bid commitments commitments[i] = Poseidon(bid_i, salt_i)
// over the compiled field, so we can build a self-consistent input for verify.circom.
template GenSotto(N) {
    signal input bids[N];
    signal input salts[N];
    signal output commitments[N];

    component h[N];
    for (var i = 0; i < N; i++) {
        h[i] = Poseidon(2);
        h[i].inputs[0] <== bids[i];
        h[i].inputs[1] <== salts[i];
        commitments[i] <== h[i].out;
    }
}

component main = GenSotto(3);
