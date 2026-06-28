# Developer Experience (DX) Report: Sotto

This document highlights the developer experience, engineering friction, and feedback during the development of Sotto using Stellar Soroban and Circom.

## 1. Circom to Soroban Integration DX

- **Groth16 Pairing Math**: Verifying Groth16 proofs requires elliptic curve pairing operations over the BN254 curve. Before Protocol 25, writing BN254 pairing verifications in Rust/WASM compiled for Soroban resulted in excessive code sizes and transactions that timed out due to CPU limits.
- **Protocol 25 Host Functions**: The introduction of `env.crypto().bn254_pairing()` in Protocol 25 solves this friction entirely. The pairing check now runs at native speed as a host function, making proof verification cost-effective (<8s latency, ~86M instructions).

## 2. Poseidon Hashing vs SHA-256

- **ZK Circuit Constraints**: Hashing user secrets (amounts, salts) inside ZK circuits is computationally expensive.
  - A standard SHA-256 hash requires ~28,000 gates/constraints in Circom.
  - Poseidon hash requires only ~240 gates/constraints.
- **Soroban Support**: Protocol 25's native `env.crypto().poseidon()` allows us to compute Poseidon hashes on-chain gas-efficiently. This creates a perfect alignment between client-side proof witness generation and smart contract validations.

## 3. Time-Lock Enforcement

- **Friction**: In typical EVM applications, time-locks rely on `block.timestamp` which is subject to validator manipulation (up to 15 seconds skew).
- **Stellar Advantage**: Using `env.ledger().sequence()` on Stellar provides strict block-level time-locks. This eliminates oracle drift and validator timestamp manipulation entirely.
