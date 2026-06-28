#!/usr/bin/env bash
# Rebuild the Sotto auction circuit + Groth16 keys over BN254 (bn128) and
# regenerate the on-chain verifier fixture. Reuses a bn128 phase-1 powers-of-tau
# (from Crisp by default) so no slow ceremony is needed. Run from anywhere.
set -euo pipefail
cd "$(dirname "$0")/.."
SJ="node_modules/.bin/snarkjs"
B="circuits/build"
PTAU="${PTAU:-../dorahacks-stellarzh-crisp/circuits/build/potbn_final.ptau}"
mkdir -p "$B"

echo "==> compile circuits over bn128"
circom circuits/verify.circom    --r1cs --wasm -o "$B" -l .
circom circuits/gen_sotto.circom --r1cs --wasm -o "$B" -l .

echo "==> reuse bn128 phase-1 ptau: $PTAU"
[ -f "$B/potbn_final.ptau" ] || cp "$PTAU" "$B/potbn_final.ptau"

echo "==> groth16 setup + verification key"
"$SJ" groth16 setup "$B/verify.r1cs" "$B/potbn_final.ptau" "$B/v_0.zkey"
"$SJ" zkey contribute "$B/v_0.zkey" "$B/v_final.zkey" --name=c1 -v -e="sotto-bn254-$(date +%s)"
"$SJ" zkey export verificationkey "$B/v_final.zkey" "$B/vk.json"

echo "==> generate fixture proof + Rust fixture"
node circuits/build/gen-fixture.mjs
node circuits/build/convert.js
echo "==> done. curve = $(node -e "console.log(require('./circuits/build/vk.json').curve)")"
