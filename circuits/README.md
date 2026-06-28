# Sotto ZK Auction Circuits 📯

This directory contains the Zero-Knowledge (ZK) auction verifier circuits for **Sotto**, built using **Circom**. The circuits prove, without exposing individual bids or the seller's secret reserve price, that a procurement auction has been settled fairly and according to the rules.

## Circuit Specifications

- **Language:** Circom `2.1.6`
- **Proof System:** Groth16 (compiled with snarkjs and Barretenberg/Noir compatible constraints)
- **Hash Primitive:** Poseidon (for efficient arithmetization over BN254 / BabyJubjub scalar fields)

## Circuits Overview

### 1. `verify.circom` (`LowestBidVerifier`)

Proves that the winning bid in a sealed-bid procurement auction is indeed the lowest bid among all participants, and verifies the identity of the winner:

- **Bid Boundaries:** Asserts that the winning bid meets the reserve price and does not exceed the maximum budget (`reservePrice <= winnerBid <= maxBudget`).
- **Correctness of Winner:** Walks through the commitment set and checks that the winner's bid is lower than or equal to all competitors' bids.
- **Identity binding:** Cryptographically verifies the winning bidder's signature using the `EdDSAPoseidonVerifier` over their commitment ($C_w = \text{Poseidon}(winnerBid, winnerSalt)$) using their public key `(winnerAx, winnerAy)`.

#### Signal Map: `verify.circom`

| Parameter                    | Type     | Visibility  | Description                                     |
| ---------------------------- | -------- | ----------- | ----------------------------------------------- |
| `maxBudget`                  | `signal` | **Public**  | Maximum allowed auction budget                  |
| `reservePrice`               | `signal` | **Public**  | Auction reserve price threshold                 |
| `commitments[N]`             | `signal` | **Public**  | Array of Poseidon commitments for all bidders   |
| `winnerIndex`                | `signal` | **Public**  | Index of the winning bidder in the array        |
| `winnerAx` / `winnerAy`      | `signal` | **Public**  | BabyJubjub public key coordinates of the winner |
| `winnerBid`                  | `signal` | **Private** | Winning bid value                               |
| `winnerSalt`                 | `signal` | **Private** | Random salt used in the winner's commitment     |
| `competitorBids[N]`          | `signal` | **Private** | Decrypted array of all competitor bids          |
| `competitorSalts[N]`         | `signal` | **Private** | Salts for all competitor bids                   |
| `sigS` / `sigR8x` / `sigR8y` | `signal` | **Private** | EdDSA-Poseidon signature components             |

---

### 2. `reserve_proof.circom` (`ReserveProofVerifier`)

Specifically designed for multi-round Dutch auctions, this circuit proves that the winning bid meets the seller's private reserve price without revealing the reserve itself:

- **Commitment Check:** Validates that the private `reserve_price` and `reserve_salt` match the public `reserve_commitment` using Poseidon.
- **Condition Check:** Asserts that the reserve is met (`reserve_price <= winning_bid`) and is within budget.
- **Dutch Schedule Check:** Validates that the winning bid is monotonically consistent with the round's Dutch price decay formula:
  $$\text{current\_dutch\_price} = \text{max\_budget} - (\text{dutch\_decrement} \times \text{round\_number})$$

#### Signal Map: `reserve_proof.circom`

| Parameter            | Type     | Visibility  | Description                                       |
| -------------------- | -------- | ----------- | ------------------------------------------------- |
| `reserve_commitment` | `signal` | **Public**  | Poseidon hash of the reserve price and salt       |
| `winning_bid`        | `signal` | **Public**  | Value of the winning bid                          |
| `max_budget`         | `signal` | **Public**  | Initial budget cap                                |
| `round_number`       | `signal` | **Public**  | Monotonic round counter (0 = Vickrey, 1+ = Dutch) |
| `dutch_decrement`    | `signal` | **Public**  | Price drop value per Dutch round                  |
| `reserve_price`      | `signal` | **Private** | Secret reserve price                              |
| `reserve_salt`       | `signal` | **Private** | Secret salt for the reserve commitment            |

---

## Development Commands

Run these commands inside the `circuits/` folder:

```bash
# Compile verify circuit to R1CS and WASM
circom verify.circom --r1cs --wasm --sym --html --output ./build

# Generate proof inputs using snarkjs
snarkjs groth16 setup build/verify.r1cs powersOfTau28_hez_final_12.ptau build/verify_0000.zkey
```

To run the full end-to-end proving and verification demo, run the following command from the project root:

```bash
npm run prove:demo
```
