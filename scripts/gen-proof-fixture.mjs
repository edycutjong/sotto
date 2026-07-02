// Generates a REAL BN254 Groth16 sealed-bid auction proof (identical pipeline
// to prove-and-verify.mjs), confirms it verifies TRUE on the deployed verifier,
// then writes it as a static fixture the web app re-verifies on-chain live.
import { execFileSync, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { randomInt } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import * as snarkjs from "snarkjs";
import { buildEddsa, buildPoseidon } from "circomlibjs";
import {
  rpc,
  TransactionBuilder,
  Networks,
  Contract,
  nativeToScVal,
  Account,
  scValToNative,
} from "@stellar/stellar-sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const C = resolve(__dirname, "../circuits/build");
const OUT = resolve(__dirname, "../src/app/api/verify-onchain/proof.json");
const VERIFIER =
  process.env.VERIFIER_ID ||
  "CBN2R3T3L6EFLNPKGHRK5OIVNTKKUY6BTP2CQ7EIRN5CWDFGMEQVKVRA";

const beHex = (dec, bytes) =>
  BigInt(dec)
    .toString(16)
    .padStart(bytes * 2, "0");
const g1 = (p) => beHex(p[0], 32) + beHex(p[1], 32);
const g2 = (p) =>
  beHex(p[0][1], 32) +
  beHex(p[0][0], 32) +
  beHex(p[1][1], 32) +
  beHex(p[1][0], 32);

async function run() {
  const reservePrice = randomInt(1, 100);
  const maxBudget = randomInt(10_000, 100_000);
  const competitorBids = [
    randomInt(100, 500),
    randomInt(500, 1000),
    randomInt(1000, 2000),
  ];
  const competitorSalts = [
    String(randomInt(1, 1e9)),
    String(randomInt(1, 1e9)),
    String(randomInt(1, 1e9)),
  ];
  const winnerBid = Math.min(...competitorBids);
  const winnerIndex = competitorBids.indexOf(winnerBid);

  execFileSync(
    "node",
    [
      `${C}/gen_sotto_js/generate_witness.js`,
      `${C}/gen_sotto_js/gen_sotto.wasm`,
      "/dev/stdin",
      `${C}/_gen.wtns`,
    ],
    {
      input: JSON.stringify({
        bids: competitorBids.map(String),
        salts: competitorSalts,
      }),
    },
  );
  execSync(`npx snarkjs wtns export json ${C}/_gen.wtns ${C}/_gen.json`, {
    stdio: "ignore",
  });
  const w = (await import(`${C}/_gen.json`, { with: { type: "json" } }))
    .default;
  const commitments = [w[1].toString(), w[2].toString(), w[3].toString()];

  const eddsa = await buildEddsa();
  const poseidon = await buildPoseidon();
  const F = eddsa.F;
  const prvKey = Buffer.from(
    "0001020304050607080900010203040506070809000102030405060708090001",
    "hex",
  );
  const pubKey = eddsa.prv2pub(prvKey);
  const winnerAx = F.toObject(pubKey[0]).toString();
  const winnerAy = F.toObject(pubKey[1]).toString();
  const msg = poseidon([winnerBid, BigInt(competitorSalts[winnerIndex])]);
  const sig = eddsa.signPoseidon(prvKey, msg);

  const input = {
    maxBudget: String(maxBudget),
    reservePrice: String(reservePrice),
    commitments,
    winnerIndex: String(winnerIndex),
    winnerBid: String(winnerBid),
    winnerSalt: competitorSalts[winnerIndex],
    competitorBids: competitorBids.map(String),
    competitorSalts,
    winnerAx,
    winnerAy,
    sigS: sig.S.toString(),
    sigR8x: eddsa.F.toObject(sig.R8[0]).toString(),
    sigR8y: eddsa.F.toObject(sig.R8[1]).toString(),
  };

  console.log("Generating real BN254 Groth16 auction proof...");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    `${C}/verify_js/verify.wasm`,
    `${C}/v_final.zkey`,
  );

  const proofHex = g1(proof.pi_a) + g2(proof.pi_b) + g1(proof.pi_c);
  const pubHex = publicSignals.map((v) => beHex(v, 32));

  const server = new rpc.Server("https://soroban-testnet.stellar.org");
  const contract = new Contract(VERIFIER);
  const call = contract.call(
    "verify_proof",
    nativeToScVal(Buffer.from(proofHex, "hex")),
    nativeToScVal(pubHex.map((p) => Buffer.from(p, "hex"))),
  );
  const source = "GAZV4ZZRKEWHOHWSVKLX7VZVDGJ6GAVSPHMFDBYMS6WQ74DBYP3FOMMX";
  const tx = new TransactionBuilder(new Account(source, "0"), {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(call)
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  const onchain =
    rpc.Api.isSimulationSuccess(sim) &&
    String(scValToNative(sim.result.retval)) === "true";
  console.log("on-chain verify_proof =>", onchain);
  if (!onchain) throw new Error("fixture proof did not verify true on-chain");

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        _comment:
          "Real BN254 Groth16 sealed-bid auction proof (snarkjs). Re-verified live on-chain by /api/verify-onchain.",
        verifier: VERIFIER,
        proofHex,
        publicInputsHex: pubHex,
      },
      null,
      2,
    ) + "\n",
  );
  console.log("Wrote fixture ->", OUT);
}
run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
