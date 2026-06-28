# Threat Model & Security Audit Report: Sotto

This document presents a security analysis, invariants list, and threat mitigation audit for the Sotto Sealed-Bid Procurement Auction Engine.

## 1. System Invariants

### 1.1. Lowest Bid Payout Invariant

For any submitted bid amount $B_i$ belonging to a bidder registered on-chain for auction $A$:
$$\forall i, \text{payout} \le B_i$$
This is cryptographically enforced via the `verify.circom` circuit, which validates that the winner's bid is less than or equal to all other private bids.

### 1.2. Budget Cap Invariant

The payout amount can never exceed the maximum escrowed budget defined at auction creation:
$$\text{payout} \le \text{max\_budget}$$
This is enforced in the `SottoAuctionContract.settle()` function.

### 1.3. Time-Lock Sequence Invariant

- Bid submissions are only allowed while `env.ledger().sequence() <= deadline`.
- Settlements are only allowed when `env.ledger().sequence() > deadline`.

## 2. Threat Vector Mitigations

### 2.1. Bid Reveal Griefing

- **Threat**: In traditional commit-and-reveal auctions, losing bidders refuse to reveal their bids, causing the auction to freeze and the contract escrow to hang.
- **Mitigation**: Sotto eliminates the reveal phase entirely. The winner fetches the public commitments and generates a ZK proof asserting they are the lowest valid bidder. Losing bid values remain encrypted and hidden, removing any dependency on losing bidders to perform actions post-deadline.

### 2.2. Underflow/Overflow Attacks

- **Threat**: Malicious bidders attempt to submit negative values or extremely large numbers to cause comparisons inside the ZK circuit or Rust contract to overflow/underflow.
- **Mitigation**: Sotto enforces 32-bit range constraint checks (`GreaterEqThan` and `LessEqThan`) inside both the Circom verifier circuit and the Soroban contract. This prevents field underflow attacks during numeric comparisons.

### 2.3. Collusion Bid Attempt

- **Threat**: Two suppliers collude and submit identical bids.
- **Mitigation**: The smart contract logs commitments in the order they are received. The first bidder to submit the commitment gets tie-breaking priority based on block-registration sequence.
