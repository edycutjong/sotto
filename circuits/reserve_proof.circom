pragma circom 2.1.6;

include "./node_modules/circomlib/circuits/poseidon.circom";
include "./node_modules/circomlib/circuits/comparators.circom";

// ReserveProofVerifier: Multi-round Dutch auction with private reserve price.
//
// Proves that the winning bid meets the seller's private reserve price
// WITHOUT revealing the reserve. Also proves:
//   1. reserve_price <= winning_bid (reserve is met)
//   2. winning_bid <= max_budget (within budget)
//   3. round_number is monotonically consistent with the Dutch price schedule
//   4. dutch_decrement * round_number is the correct price reduction
//   5. reserve_commitment = Poseidon(reserve_price, reserve_salt) matches public
//
// Public signals:
//   [ reserve_commitment, winning_bid, max_budget, round_number, dutch_decrement ]

template ReserveProofVerifier() {
    // Public Inputs
    signal input reserve_commitment;   // Poseidon(reserve_price, reserve_salt)
    signal input winning_bid;
    signal input max_budget;
    signal input round_number;         // which Dutch round (0 = Vickrey, 1..N = Dutch)
    signal input dutch_decrement;      // price drop per Dutch round

    // Private Inputs
    signal input reserve_price;
    signal input reserve_salt;

    // 1. Verify reserve commitment: H(reserve_price, reserve_salt) == reserve_commitment
    component reserveHasher = Poseidon(2);
    reserveHasher.inputs[0] <== reserve_price;
    reserveHasher.inputs[1] <== reserve_salt;
    reserveHasher.out === reserve_commitment;

    // 2. Reserve is met: reserve_price <= winning_bid
    component reserveCheck = LessEqThan(64);
    reserveCheck.in[0] <== reserve_price;
    reserveCheck.in[1] <== winning_bid;
    reserveCheck.out === 1;

    // 3. Budget cap: winning_bid <= max_budget
    component budgetCheck = LessEqThan(64);
    budgetCheck.in[0] <== winning_bid;
    budgetCheck.in[1] <== max_budget;
    budgetCheck.out === 1;

    // 4. Dutch price schedule validation:
    //    current_dutch_price = max_budget - (dutch_decrement * round_number)
    //    winning_bid >= current_dutch_price (in Dutch rounds, bid must be at or above current price)
    signal dutch_reduction;
    dutch_reduction <== dutch_decrement * round_number;

    // Ensure reduction doesn't exceed max_budget (prevents underflow)
    component reductionCheck = LessEqThan(64);
    reductionCheck.in[0] <== dutch_reduction;
    reductionCheck.in[1] <== max_budget;
    reductionCheck.out === 1;

    signal current_dutch_price;
    current_dutch_price <== max_budget - dutch_reduction;

    component dutchFloorCheck = LessEqThan(64);
    dutchFloorCheck.in[0] <== current_dutch_price;
    dutchFloorCheck.in[1] <== winning_bid;
    dutchFloorCheck.out === 1;

    // 5. Reserve must be at or below initial price
    component reserveFloor = LessEqThan(64);
    reserveFloor.in[0] <== reserve_price;
    reserveFloor.in[1] <== max_budget;
    reserveFloor.out === 1;
}

component main {public [reserve_commitment, winning_bid, max_budget, round_number, dutch_decrement]} = ReserveProofVerifier();
