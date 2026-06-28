# Sotto Auction Contract 📯

A privacy-preserving, sealed-bid procurement auction contract designed for Stellar Soroban. This contract allows creators to spin up reverse auctions with a maximum spending budget and reserve price, while bidders submit cryptographically blinded bid commitments on-chain. Verification of the winner is executed using ZK proofs without revealing losing bid values.

## Architecture & Design

- **Language**: Rust
- **Platform**: Soroban (Stellar Smart Contracts)
- **Toolchain**: Target `wasm32-unknown-unknown` (under workspace root).

## API Endpoints

### `create_auction(env, creator, token, max_budget, reserve_price, deadline) -> u32`

Creates a new auction, transfers the creator's maximum budget into the contract escrow, and initializes the state to `Bidding`. Returns the generated auction ID.

### `set_verifier(env, admin, verifier)`

Sets the address of the `SottoVerifier` contract. restricted to the creator/admin.

### `submit_bid(env, auction_id, bidder, commitment)`

Allows a bidder to submit a cryptographic commitment of their bid (typically a SHA-256 hash of the bid value and a salt) during the bidding phase before the deadline.

### `settle_auction(env, auction_id, winner, payout_amount, salt, proof) -> bool`

Settles the auction. Requires a ZK proof to verify that:

1. The winner's bid matches the on-chain commitment.
2. The winner's bid is less than or equal to the creator's max budget.
3. The winner's bid is greater than or equal to the reserve price.
   Transfers the payout amount to the winner, returns the remaining budget refund back to the creator, and transition the state to `Settled`.

### `get_auction(env, auction_id) -> Option<Auction>`

Retrieves the complete auction status and state details.

## Unit Testing

Run contract unit tests from the workspace root or the contract directory:

```bash
cargo test -p sotto_auction
```
