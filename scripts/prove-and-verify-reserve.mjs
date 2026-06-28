// End-to-end REAL proving demo for Sotto's v3 multi-round Dutch auction reserve
// proof: reserve_proof circuit (private reserve price + Poseidon commitment +
// Dutch price-schedule checks) -> snarkjs groth16.fullProve (bn128) -> soroban
// bytes -> on-chain verify_proof on the dedicated reserve verifier. Tampered
// public inputs are rejected.
//
// publicSignals order:
//   [ reserve_commitment, winning_bid, max_budget, round_number, dutch_decrement ]
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import * as snarkjs from "snarkjs";
import { buildPoseidon } from "circomlibjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const C = resolve(__dirname, "../circuits/build");
const VERIFIER = process.env.RESERVE_VERIFIER_ID || "CA3DTYCC77WMKD7Y43T7TR6SCO5OZVO5FSMF2ALSX5KK7PNQRQ3UQA6W";

const beHex = (dec, bytes) => BigInt(dec).toString(16).padStart(bytes * 2, "0");
const g1 = (p) => beHex(p[0], 32) + beHex(p[1], 32);
const g2 = (p) => beHex(p[0][1], 32) + beHex(p[0][0], 32) + beHex(p[1][1], 32) + beHex(p[1][0], 32);

async function run() {
  // Dutch schedule: max_budget 100000, decrement 10000, round 5 -> price 50000.
  const reserve_price = "40000", reserve_salt = "12345";
  const winning_bid = "60000", max_budget = "100000", round_number = "5", dutch_decrement = "10000";

  const poseidon = await buildPoseidon();
  const reserve_commitment = poseidon.F.toObject(poseidon([BigInt(reserve_price), BigInt(reserve_salt)])).toString();

  const input = { reserve_commitment, winning_bid, max_budget, round_number, dutch_decrement, reserve_price, reserve_salt };

  console.log("Generating real BN254 Groth16 Dutch-auction reserve proof...");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input, `${C}/reserve_proof_js/reserve_proof.wasm`, `${C}/r_final.zkey`);
  const vk = (await import(`${C}/reserve_vk.json`, { with: { type: "json" } })).default;
  console.log("off-chain verify:", await snarkjs.groth16.verify(vk, publicSignals, proof));

  const proofHex = g1(proof.pi_a) + g2(proof.pi_b) + g1(proof.pi_c);
  const pubHex = publicSignals.map((v) => beHex(v, 32));

  const invoke = (pubs) => execFileSync("stellar", [
    "contract", "invoke", "--id", VERIFIER, "--source", "deployer", "--network", "testnet",
    "--", "verify_proof", "--proof", proofHex, "--public_inputs", JSON.stringify(pubs),
  ], { encoding: "utf8", env: { ...process.env, PATH: `${process.env.HOME}/homebrew/bin:${process.env.PATH}` } }).trim().split("\n").pop().trim();

  console.log("Invoking on-chain verify_proof on", VERIFIER, "...");
  const onchain = invoke(pubHex);
  console.log("on-chain verify_proof =>", onchain);
  if (onchain !== "true") process.exit(1);

  // negative control: tamper winning_bid public input -> must be rejected
  const bad = [...pubHex];
  bad[1] = "0000000000000000000000000000000000000000000000000000000000000001";
  const tampered = invoke(bad);
  console.log("on-chain verify_proof (tampered) =>", tampered);
  if (tampered === "true") { console.error("tampered proof accepted!"); process.exit(1); }

  console.log("\n✅ Real BN254 Groth16 Dutch-auction reserve proof verified on-chain; tampered proof rejected.");
}
run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
