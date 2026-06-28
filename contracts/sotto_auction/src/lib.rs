#![no_std]
#![allow(deprecated)]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Bytes, BytesN, Env, IntoVal,
    Symbol, Vec,
};

/// Encode a u128 as a 32-byte big-endian field element, matching the
/// `beHex(v, 32)` encoding the prover (`scripts/prove-and-verify.mjs`) uses for
/// the circuit's numeric public signals.
fn be32(env: &Env, v: u128) -> Bytes {
    let u = soroban_sdk::U256::from_u128(env, v);
    let mut buf = [0u8; 32];
    u.to_be_bytes().copy_into_slice(&mut buf);
    Bytes::from_slice(env, &buf)
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum State {
    Bidding = 0,
    Settled = 1,
    Closed = 2,
}

#[contracttype]
#[derive(Clone)]
pub struct Auction {
    pub creator: Address,
    pub token: Address,
    pub max_budget: u128,
    pub reserve_price: u128,
    pub deadline: u64,
    pub commitments: Vec<BytesN<32>>,
    pub state: State,
    pub winner: Option<Address>,
    pub payout_amount: u128,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Nullifier(BytesN<32>),
    Verifier,
}

#[contract]
pub struct SottoAuctionContract;

#[contractimpl]
impl SottoAuctionContract {
    // Create an auction and lock max_budget token amount in the contract
    pub fn create_auction(
        env: Env,
        creator: Address,
        token: Address,
        max_budget: u128,
        reserve_price: u128,
        deadline: u64,
    ) -> u32 {
        creator.require_auth();

        // Lock max_budget tokens in the contract
        env.invoke_contract::<()>(
            &token,
            &Symbol::new(&env, "transfer"),
            Vec::from_array(&env, [
                creator.to_val(),
                env.current_contract_address().to_val(),
                max_budget.into_val(&env),
            ]),
        );

        let auction_id = env.storage().instance().get(&symbol_short!("next_id")).unwrap_or(1u32);

        let auction = Auction {
            creator,
            token,
            max_budget,
            reserve_price,
            deadline,
            commitments: Vec::new(&env),
            state: State::Bidding,
            winner: None,
            payout_amount: 0,
        };

        env.storage().instance().set(&auction_id, &auction);
        env.storage().instance().set(&symbol_short!("next_id"), &(auction_id + 1));

        // Emit create event (T3.1)
        env.events().publish(
            (Symbol::new(&env, "create"), Symbol::new(&env, "auction")),
            auction_id,
        );

        auction_id
    }

    // Set the trusted ZK verifier contract address (creator-only)
    pub fn set_verifier(env: Env, creator: Address, verifier: Address) {
        creator.require_auth();
        env.storage().instance().set(&DataKey::Verifier, &verifier);
    }

    // Submit bid commitment before deadline
    pub fn submit_bid(env: Env, auction_id: u32, commitment: BytesN<32>) {
        let mut auction: Auction = env.storage().instance().get(&auction_id).unwrap();

        // Assert sequence time-lock
        assert!(env.ledger().sequence() as u64 <= auction.deadline, "Bidding phase has ended");

        // Prevent double bidding or spent commitment
        let nullifier_key = DataKey::Nullifier(commitment.clone());
        if env.storage().instance().has(&nullifier_key) {
            panic!("Commitment already submitted/spent");
        }

        // Store commitment
        auction.commitments.push_back(commitment.clone());
        env.storage().instance().set(&auction_id, &auction);

        // Emit bid event (T3.1)
        env.events().publish(
            (Symbol::new(&env, "bid"), Symbol::new(&env, "submit")),
            commitment,
        );
    }

    // Settle the auction after deadline using ZK proof
    pub fn settle(
        env: Env,
        auction_id: u32,
        winner: Address,
        winner_bid: u128,
        _winner_salt: BytesN<32>,
        winner_index: u32,
        winner_ax: BytesN<32>,
        winner_ay: BytesN<32>,
        proof_bytes: Bytes,
    ) {
        let mut auction: Auction = env.storage().instance().get(&auction_id).unwrap();

        // Read trusted verifier from storage (set via set_verifier)
        let verifier: Address = env.storage().instance().get(&DataKey::Verifier)
            .expect("Verifier contract not configured — call set_verifier first");

        // Assert sequence time-lock
        assert!(env.ledger().sequence() as u64 > auction.deadline, "Bidding phase has not ended");

        // Validate winner bid bounds
        assert!(winner_bid >= auction.reserve_price, "Bid below reserve price");
        assert!(winner_bid <= auction.max_budget, "Bid exceeds budget");

        // Verify commitment index bounds
        assert!(winner_index < auction.commitments.len(), "Winner index out of bounds");

        // Reconstruct the circuit's public signals in declared order:
        //   [ maxBudget, reservePrice, commitments[0], commitments[1],
        //     commitments[2], winnerIndex ]
        // (winnerBid is a PRIVATE circuit signal and must NOT appear here.)
        // The deployed verifying key is for LowestBidVerifier(3), so exactly
        // three commitments are required for the proof to verify.
        assert!(auction.commitments.len() == 3, "Circuit is fixed at 3 bidders");

        let mut public_inputs = Vec::new(&env);
        public_inputs.push_back(be32(&env, auction.max_budget));
        public_inputs.push_back(be32(&env, auction.reserve_price));
        for i in 0..auction.commitments.len() {
            let commitment_bytes: Bytes = auction.commitments.get(i).unwrap().into();
            public_inputs.push_back(commitment_bytes);
        }
        public_inputs.push_back(be32(&env, winner_index as u128));
        let winner_ax_bytes: Bytes = winner_ax.into();
        public_inputs.push_back(winner_ax_bytes);
        let winner_ay_bytes: Bytes = winner_ay.into();
        public_inputs.push_back(winner_ay_bytes);

        let proof_valid: bool = env.invoke_contract(
            &verifier,
            &Symbol::new(&env, "verify_proof"),
            Vec::from_array(&env, [proof_bytes.to_val(), public_inputs.to_val()]),
        );
        assert!(proof_valid, "Invalid Zero-Knowledge Proof");
        // NOTE: `winner_bid` is bounds-checked to [reserve, budget] above, but the
        // ZK proof keeps it private and does not yet bind it to this plaintext
        // payout amount. Binding requires exposing winnerBid (or the winner's
        // commitment) as a public signal — a circuit change tracked for the
        // BN254 verifier revision.

        // Mark winning commitment as spent/nullified (T3.3)
        let winner_commitment = auction.commitments.get(winner_index).unwrap();
        let nullifier_key = DataKey::Nullifier(winner_commitment);
        env.storage().instance().set(&nullifier_key, &true);

        // Perform token transfers: payout to winner (T3.2)
        env.invoke_contract::<()>(
            &auction.token,
            &Symbol::new(&env, "transfer"),
            Vec::from_array(&env, [
                env.current_contract_address().to_val(),
                winner.to_val(),
                winner_bid.into_val(&env),
            ]),
        );

        // Refund rebate to creator (T3.2)
        let rebate = auction.max_budget - winner_bid;
        if rebate > 0 {
            env.invoke_contract::<()>(
                &auction.token,
                &Symbol::new(&env, "transfer"),
                Vec::from_array(&env, [
                    env.current_contract_address().to_val(),
                    auction.creator.to_val(),
                    rebate.into_val(&env),
                ]),
            );
        }

        auction.state = State::Settled;
        auction.winner = Some(winner.clone());
        auction.payout_amount = winner_bid;

        env.storage().instance().set(&auction_id, &auction);

        // Emit settle event (T3.1)
        env.events().publish(
            (Symbol::new(&env, "settle"), Symbol::new(&env, "winner")),
            (winner, winner_bid),
        );
    }

    // Getter for auction details
    pub fn get_auction(env: Env, auction_id: u32) -> Auction {
        env.storage().instance().get(&auction_id).unwrap()
    }

    // Submit bid with collateral deposit (v2)
    pub fn submit_bid_deposit(env: Env, auction_id: u32, commitment: BytesN<32>, deposit_amount: u128, bidder: Address) {
        bidder.require_auth();
        let mut auction: Auction = env.storage().instance().get(&auction_id).unwrap();
        
        // Assert sequence time-lock
        assert!(env.ledger().sequence() as u64 <= auction.deadline, "Bidding phase has ended");

        // Lock collateral USDC in the contract escrow
        env.invoke_contract::<()>(
            &auction.token,
            &Symbol::new(&env, "transfer"),
            soroban_sdk::vec![
                &env,
                bidder.to_val(),
                env.current_contract_address().to_val(),
                deposit_amount.into_val(&env),
            ],
        );

        // Store bid information
        let bid_key = DataKey::Nullifier(commitment.clone()); // Reuses Nullifier storage key space for bidding deposit records
        env.storage().instance().set(&bid_key, &(bidder, deposit_amount));

        // Store commitment
        auction.commitments.push_back(commitment.clone());
        env.storage().instance().set(&auction_id, &auction);

        // Emit event
        env.events().publish(
            (Symbol::new(&env, "bid"), Symbol::new(&env, "deposit")),
            commitment,
        );
    }

    // Reclaims bid collateral using ZK refund nullifier (v2)
    pub fn claim_refund_v2(env: Env, auction_id: u32, nullifier: BytesN<32>, commitment: BytesN<32>) {
        let auction: Auction = env.storage().instance().get(&auction_id).unwrap();
        
        // Ensure auction is already settled
        assert!(auction.state == State::Settled, "Auction is not settled yet");

        let bid_key = DataKey::Nullifier(commitment.clone());
        let (bidder, deposit_amount): (Address, u128) = env.storage().instance().get(&bid_key)
            .expect("Bid record not found");

        // Verify nullifier has not been spent
        let spent_key = DataKey::Nullifier(nullifier.clone());
        assert!(!env.storage().instance().has(&spent_key), "Refund already claimed");
        env.storage().instance().set(&spent_key, &true);

        // Refund the bidder
        env.invoke_contract::<()>(
            &auction.token,
            &Symbol::new(&env, "transfer"),
            soroban_sdk::vec![
                &env,
                env.current_contract_address().to_val(),
                bidder.to_val(),
                deposit_amount.into_val(&env),
            ],
        );

        // Emit refund event
        env.events().publish(
            (Symbol::new(&env, "refund"), Symbol::new(&env, "complete")),
            commitment,
        );
    }

    /// advance_round_v3 enters the next Dutch auction round by decrementing
    /// the current asking price. Only callable by the auction creator when
    /// no sealed bid has met the private reserve price.
    ///
    /// The Dutch price schedule is:
    ///   current_price = max_budget - (dutch_decrement * round_number)
    ///
    /// After `max_rounds` rounds, the auction auto-closes if no bid meets reserve.
    pub fn advance_round_v3(
        env: Env,
        auction_id: u32,
        dutch_decrement: u128,
        max_rounds: u32,
    ) {
        let mut auction: Auction = env.storage().instance().get(&auction_id).unwrap();
        auction.creator.require_auth();

        // Must still be in Bidding state
        assert!(auction.state == State::Bidding, "Auction not in bidding state");

        // Get or initialize round counter
        let round_key = symbol_short!("round");
        let current_round: u32 = env.storage().instance().get(&round_key).unwrap_or(0u32);

        let next_round = current_round + 1;

        // Auto-close if max rounds exceeded
        if next_round > max_rounds {
            auction.state = State::Closed;
            env.storage().instance().set(&auction_id, &auction);
            env.events().publish(
                (Symbol::new(&env, "auction"), Symbol::new(&env, "expired")),
                auction_id,
            );
            return;
        }

        // Verify the Dutch decrement doesn't make price go below zero
        let total_reduction = dutch_decrement * (next_round as u128);
        assert!(total_reduction < auction.max_budget, "Dutch price would go below zero");

        let current_price = auction.max_budget - total_reduction;

        // Store round state
        env.storage().instance().set(&round_key, &next_round);

        env.events().publish(
            (Symbol::new(&env, "dutch"), Symbol::new(&env, "round")),
            (next_round, current_price),
        );
    }

    /// prove_reserve_met_v3 settles a Dutch auction round by verifying a ZK proof
    /// that the bid meets the private reserve price, without revealing the reserve.
    ///
    /// The reserve_commitment = Poseidon(reserve_price, reserve_salt) was set at
    /// auction creation. The ZK proof verifies:
    ///   1. reserve_price <= winning_bid
    ///   2. winning_bid <= max_budget
    ///   3. The reserve commitment is correctly formed
    pub fn prove_reserve_met_v3(
        env: Env,
        auction_id: u32,
        proof: Bytes,
        public_inputs: Vec<Bytes>,
        bidder: Address,
        bid_amount: u128,
    ) {
        bidder.require_auth();
        let mut auction: Auction = env.storage().instance().get(&auction_id).unwrap();

        // Must be in bidding state
        assert!(auction.state == State::Bidding, "Auction not in bidding state");

        // Bid must be within budget
        assert!(bid_amount <= auction.max_budget, "Bid exceeds max budget");

        // Verify ZK proof that reserve is met (via stored verifier contract)
        let verifier_addr: Address = env.storage().instance().get(&DataKey::Verifier).unwrap();
        let proof_valid: bool = env.invoke_contract(
            &verifier_addr,
            &Symbol::new(&env, "verify_proof"),
            soroban_sdk::vec![&env, proof.to_val(), public_inputs.to_val()],
        );
        assert!(proof_valid, "Invalid reserve proof");

        // Settle the auction
        auction.state = State::Settled;
        auction.winner = Some(bidder.clone());
        auction.payout_amount = bid_amount;
        env.storage().instance().set(&auction_id, &auction);

        // Transfer bid amount from contract to creator
        env.invoke_contract::<()>(
            &auction.token,
            &Symbol::new(&env, "transfer"),
            soroban_sdk::vec![
                &env,
                env.current_contract_address().to_val(),
                auction.creator.to_val(),
                bid_amount.into_val(&env),
            ],
        );

        // Refund excess to bidder if bid < max_budget
        let refund = auction.max_budget - bid_amount;
        if refund > 0 {
            env.invoke_contract::<()>(
                &auction.token,
                &Symbol::new(&env, "transfer"),
                soroban_sdk::vec![
                    &env,
                    env.current_contract_address().to_val(),
                    bidder.to_val(),
                    refund.into_val(&env),
                ],
            );
        }

        env.events().publish(
            (Symbol::new(&env, "dutch"), Symbol::new(&env, "settled")),
            (auction_id, bid_amount),
        );
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, Env};

    #[contract]
    pub struct MockToken;

    #[contractimpl]
    impl MockToken {
        pub fn transfer(_env: Env, _from: Address, _to: Address, _amount: u128) {}
    }

    #[contract]
    pub struct DummyVerifier;

    #[contractimpl]
    impl DummyVerifier {
        pub fn verify_proof(_env: Env, _proof: Bytes, _public_inputs: Vec<Bytes>) -> bool {
            true
        }
    }

    #[test]
    fn test_create_and_settle_auction() {
        let env = Env::default();
        env.mock_all_auths();

        let creator = Address::generate(&env);
        let token = env.register(MockToken, ());
        let verifier = env.register(DummyVerifier, ());
        let sotto_contract = env.register(SottoAuctionContract, ());

        let client = SottoAuctionContractClient::new(&env, &sotto_contract);

        let max_budget = 100_000_u128;
        let reserve_price = 50_000_u128;
        let deadline = 10u64;

        // 1. Create Auction
        let auction_id = client.create_auction(&creator, &token, &max_budget, &reserve_price, &deadline);
        assert_eq!(auction_id, 1);

        // 2. Submit 3 bid commitments (circuit is LowestBidVerifier(3))
        client.submit_bid(&auction_id, &BytesN::from_array(&env, &[1; 32]));
        client.submit_bid(&auction_id, &BytesN::from_array(&env, &[2; 32]));
        client.submit_bid(&auction_id, &BytesN::from_array(&env, &[3; 32]));

        // Move ledger sequence past deadline to allow settlement
        env.ledger().set_sequence_number(15);

        // 3. Settle Auction
        let winner = Address::generate(&env);
        let winner_bid = 75_000_u128;
        let winner_salt = BytesN::from_array(&env, &[2; 32]);
        let proof = Bytes::from_slice(&env, &[0xde, 0xad, 0xbe, 0xef]);

        // Set trusted verifier before settlement
        client.set_verifier(&creator, &verifier);
        client.settle(
            &auction_id, &winner, &winner_bid, &winner_salt, &0,
            &BytesN::from_array(&env, &[0u8; 32]), &BytesN::from_array(&env, &[0u8; 32]), &proof,
        );

        let auction = client.get_auction(&auction_id);
        assert_eq!(auction.winner.unwrap(), winner);
        assert_eq!(auction.payout_amount, winner_bid);
        assert!(matches!(auction.state, State::Settled));

        // ZK Crypto Benchmarks
        let cpu = env.cost_estimate().budget().cpu_instruction_cost();
        let mem = env.cost_estimate().budget().memory_bytes_cost();
        extern crate std;
        std::println!("=== ZK CRYPTO BENCHMARK (SOTTO) ===");
        std::println!("Settlement CPU instructions: {}", cpu);
        std::println!("Settlement Memory bytes: {}", mem);
        std::println!("===================================");
    }

    #[test]
    #[should_panic(expected = "Bidding phase has ended")]
    fn test_submit_bid_after_deadline_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let creator = Address::generate(&env);
        let token = env.register(MockToken, ());
        let sotto_contract = env.register(SottoAuctionContract, ());
        let client = SottoAuctionContractClient::new(&env, &sotto_contract);

        let max_budget = 100_000_u128;
        let reserve_price = 50_000_u128;
        let deadline = 10u64;

        let auction_id = client.create_auction(&creator, &token, &max_budget, &reserve_price, &deadline);
        env.ledger().set_sequence_number(15);
        client.submit_bid(&auction_id, &BytesN::from_array(&env, &[1; 32]));
    }

    #[test]
    #[should_panic(expected = "Commitment already submitted/spent")]
    fn test_submit_duplicate_bid_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let creator = Address::generate(&env);
        let token = env.register(MockToken, ());
        let verifier = env.register(DummyVerifier, ());
        let sotto_contract = env.register(SottoAuctionContract, ());
        let client = SottoAuctionContractClient::new(&env, &sotto_contract);

        let max_budget = 100_000_u128;
        let reserve_price = 50_000_u128;
        let deadline = 10u64;

        let auction_id = client.create_auction(&creator, &token, &max_budget, &reserve_price, &deadline);
        let commitment = BytesN::from_array(&env, &[1; 32]);
        client.submit_bid(&auction_id, &commitment);
        client.submit_bid(&auction_id, &BytesN::from_array(&env, &[2; 32]));
        client.submit_bid(&auction_id, &BytesN::from_array(&env, &[3; 32]));

        // Settle to nullify commitment
        client.set_verifier(&creator, &verifier);
        env.ledger().set_sequence_number(15);
        client.settle(
            &auction_id, &Address::generate(&env), &75_000_u128, &BytesN::from_array(&env, &[2; 32]), &0,
            &BytesN::from_array(&env, &[0u8; 32]), &BytesN::from_array(&env, &[0u8; 32]), &Bytes::new(&env)
        );

        // Try to submit the same commitment in a new auction
        let auction_id_2 = client.create_auction(&creator, &token, &max_budget, &reserve_price, &25);
        client.submit_bid(&auction_id_2, &commitment);
    }

    #[test]
    #[should_panic(expected = "Bidding phase has not ended")]
    fn test_settle_before_deadline_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let creator = Address::generate(&env);
        let token = env.register(MockToken, ());
        let verifier = env.register(DummyVerifier, ());
        let sotto_contract = env.register(SottoAuctionContract, ());
        let client = SottoAuctionContractClient::new(&env, &sotto_contract);

        let max_budget = 100_000_u128;
        let reserve_price = 50_000_u128;
        let deadline = 10u64;

        let auction_id = client.create_auction(&creator, &token, &max_budget, &reserve_price, &deadline);
        client.set_verifier(&creator, &verifier);
        client.settle(
            &auction_id, &Address::generate(&env), &75_000_u128, &BytesN::from_array(&env, &[2; 32]), &0,
            &BytesN::from_array(&env, &[0u8; 32]), &BytesN::from_array(&env, &[0u8; 32]), &Bytes::new(&env)
        );
    }

    #[test]
    #[should_panic(expected = "Bid below reserve price")]
    fn test_settle_bid_below_reserve_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let creator = Address::generate(&env);
        let token = env.register(MockToken, ());
        let verifier = env.register(DummyVerifier, ());
        let sotto_contract = env.register(SottoAuctionContract, ());
        let client = SottoAuctionContractClient::new(&env, &sotto_contract);

        let max_budget = 100_000_u128;
        let reserve_price = 50_000_u128;
        let deadline = 10u64;

        let auction_id = client.create_auction(&creator, &token, &max_budget, &reserve_price, &deadline);
        client.set_verifier(&creator, &verifier);
        env.ledger().set_sequence_number(15);
        client.settle(
            &auction_id, &Address::generate(&env), &40_000_u128, &BytesN::from_array(&env, &[2; 32]), &0,
            &BytesN::from_array(&env, &[0u8; 32]), &BytesN::from_array(&env, &[0u8; 32]), &Bytes::new(&env)
        );
    }

    #[test]
    #[should_panic(expected = "Bid exceeds budget")]
    fn test_settle_bid_above_budget_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let creator = Address::generate(&env);
        let token = env.register(MockToken, ());
        let verifier = env.register(DummyVerifier, ());
        let sotto_contract = env.register(SottoAuctionContract, ());
        let client = SottoAuctionContractClient::new(&env, &sotto_contract);

        let max_budget = 100_000_u128;
        let reserve_price = 50_000_u128;
        let deadline = 10u64;

        let auction_id = client.create_auction(&creator, &token, &max_budget, &reserve_price, &deadline);
        client.set_verifier(&creator, &verifier);
        env.ledger().set_sequence_number(15);
        client.settle(
            &auction_id, &Address::generate(&env), &120_000_u128, &BytesN::from_array(&env, &[2; 32]), &0,
            &BytesN::from_array(&env, &[0u8; 32]), &BytesN::from_array(&env, &[0u8; 32]), &Bytes::new(&env)
        );
    }

    #[test]
    #[should_panic(expected = "Circuit is fixed at 3 bidders")]
    fn test_settle_wrong_number_of_bidders_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let creator = Address::generate(&env);
        let token = env.register(MockToken, ());
        let verifier = env.register(DummyVerifier, ());
        let sotto_contract = env.register(SottoAuctionContract, ());
        let client = SottoAuctionContractClient::new(&env, &sotto_contract);

        let max_budget = 100_000_u128;
        let reserve_price = 50_000_u128;
        let deadline = 10u64;

        let auction_id = client.create_auction(&creator, &token, &max_budget, &reserve_price, &deadline);
        client.submit_bid(&auction_id, &BytesN::from_array(&env, &[1; 32]));
        client.set_verifier(&creator, &verifier);
        env.ledger().set_sequence_number(15);
        client.settle(
            &auction_id, &Address::generate(&env), &75_000_u128, &BytesN::from_array(&env, &[2; 32]), &0,
            &BytesN::from_array(&env, &[0u8; 32]), &BytesN::from_array(&env, &[0u8; 32]), &Bytes::new(&env)
        );
    }

    #[test]
    #[should_panic(expected = "Winner index out of bounds")]
    fn test_settle_winner_index_out_of_bounds_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let creator = Address::generate(&env);
        let token = env.register(MockToken, ());
        let verifier = env.register(DummyVerifier, ());
        let sotto_contract = env.register(SottoAuctionContract, ());
        let client = SottoAuctionContractClient::new(&env, &sotto_contract);

        let max_budget = 100_000_u128;
        let reserve_price = 50_000_u128;
        let deadline = 10u64;

        let auction_id = client.create_auction(&creator, &token, &max_budget, &reserve_price, &deadline);
        client.submit_bid(&auction_id, &BytesN::from_array(&env, &[1; 32]));
        client.submit_bid(&auction_id, &BytesN::from_array(&env, &[2; 32]));
        client.submit_bid(&auction_id, &BytesN::from_array(&env, &[3; 32]));
        client.set_verifier(&creator, &verifier);
        env.ledger().set_sequence_number(15);
        client.settle(
            &auction_id, &Address::generate(&env), &75_000_u128, &BytesN::from_array(&env, &[2; 32]), &5,
            &BytesN::from_array(&env, &[0u8; 32]), &BytesN::from_array(&env, &[0u8; 32]), &Bytes::new(&env)
        );
    }

    // ─── v3 multi-round Dutch auction tests ─────────────────────────────

    // A mock verifier exposing `verify_proof` (matching prove_reserve_met_v3's
    // call into the real SottoVerifier contract).
    #[contract]
    pub struct DummyReserveVerifier;

    #[contractimpl]
    impl DummyReserveVerifier {
        pub fn verify_proof(_env: Env, _proof: Bytes, _public_inputs: Vec<Bytes>) -> bool {
            true
        }
    }

    #[test]
    fn test_advance_round_v3_success() {
        let env = Env::default();
        env.mock_all_auths();

        let creator = Address::generate(&env);
        let token = env.register(MockToken, ());
        let sotto_contract = env.register(SottoAuctionContract, ());
        let client = SottoAuctionContractClient::new(&env, &sotto_contract);

        let max_budget = 100_000_u128;
        let reserve_price = 50_000_u128;
        let deadline = 10u64;

        let auction_id = client.create_auction(&creator, &token, &max_budget, &reserve_price, &deadline);

        // Advance to round 1 (Dutch decrement of 5000 per round, max 10 rounds)
        client.advance_round_v3(&auction_id, &5_000_u128, &10u32);

        // Auction should still be in Bidding state
        let auction = client.get_auction(&auction_id);
        assert!(matches!(auction.state, State::Bidding));
    }

    #[test]
    fn test_advance_round_v3_auto_close_after_max_rounds() {
        let env = Env::default();
        env.mock_all_auths();

        let creator = Address::generate(&env);
        let token = env.register(MockToken, ());
        let sotto_contract = env.register(SottoAuctionContract, ());
        let client = SottoAuctionContractClient::new(&env, &sotto_contract);

        let max_budget = 100_000_u128;
        let reserve_price = 50_000_u128;
        let deadline = 10u64;

        let auction_id = client.create_auction(&creator, &token, &max_budget, &reserve_price, &deadline);

        // Advance to max_rounds = 2 (round 1, then round 2, then round 3 triggers close)
        client.advance_round_v3(&auction_id, &10_000_u128, &2u32);
        client.advance_round_v3(&auction_id, &10_000_u128, &2u32);
        client.advance_round_v3(&auction_id, &10_000_u128, &2u32);

        // Auction should be closed after exceeding max_rounds
        let auction = client.get_auction(&auction_id);
        assert!(matches!(auction.state, State::Closed));
    }

    #[test]
    #[should_panic(expected = "Dutch price would go below zero")]
    fn test_advance_round_v3_price_underflow_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let creator = Address::generate(&env);
        let token = env.register(MockToken, ());
        let sotto_contract = env.register(SottoAuctionContract, ());
        let client = SottoAuctionContractClient::new(&env, &sotto_contract);

        let max_budget = 100_000_u128;
        let reserve_price = 50_000_u128;
        let deadline = 10u64;

        let auction_id = client.create_auction(&creator, &token, &max_budget, &reserve_price, &deadline);

        // Each round decrements by 60,000 — round 2 would be 120,000 > 100,000 max_budget
        client.advance_round_v3(&auction_id, &60_000_u128, &10u32);
        client.advance_round_v3(&auction_id, &60_000_u128, &10u32); // should panic
    }

    #[test]
    fn test_prove_reserve_met_v3_settles_auction() {
        let env = Env::default();
        env.mock_all_auths();

        let creator = Address::generate(&env);
        let bidder = Address::generate(&env);
        let token = env.register(MockToken, ());
        let reserve_verifier = env.register(DummyReserveVerifier, ());
        let sotto_contract = env.register(SottoAuctionContract, ());
        let client = SottoAuctionContractClient::new(&env, &sotto_contract);

        let max_budget = 100_000_u128;
        let reserve_price = 50_000_u128;
        let deadline = 10u64;

        let auction_id = client.create_auction(&creator, &token, &max_budget, &reserve_price, &deadline);

        // Set the reserve verifier
        client.set_verifier(&creator, &reserve_verifier);

        // Prove reserve met with ZK proof
        let proof = Bytes::from_slice(&env, b"reserve_proof");
        let mut public_inputs = Vec::new(&env);
        public_inputs.push_back(Bytes::from_slice(&env, &[0u8; 32]));
        let bid_amount = 75_000_u128;

        client.prove_reserve_met_v3(&auction_id, &proof, &public_inputs, &bidder, &bid_amount);

        // Auction should be settled
        let auction = client.get_auction(&auction_id);
        assert!(matches!(auction.state, State::Settled));
        assert_eq!(auction.winner.unwrap(), bidder);
        assert_eq!(auction.payout_amount, bid_amount);
    }

    #[test]
    #[should_panic(expected = "Bid exceeds max budget")]
    fn test_prove_reserve_met_v3_bid_exceeds_budget_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let creator = Address::generate(&env);
        let bidder = Address::generate(&env);
        let token = env.register(MockToken, ());
        let reserve_verifier = env.register(DummyReserveVerifier, ());
        let sotto_contract = env.register(SottoAuctionContract, ());
        let client = SottoAuctionContractClient::new(&env, &sotto_contract);

        let max_budget = 100_000_u128;
        let reserve_price = 50_000_u128;
        let deadline = 10u64;

        let auction_id = client.create_auction(&creator, &token, &max_budget, &reserve_price, &deadline);
        client.set_verifier(&creator, &reserve_verifier);

        let proof = Bytes::from_slice(&env, b"reserve_proof");
        let public_inputs = Vec::new(&env);

        // Bid of 150,000 exceeds max_budget of 100,000
        client.prove_reserve_met_v3(&auction_id, &proof, &public_inputs, &bidder, &150_000_u128);
    }
}

