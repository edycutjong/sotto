// Real BLS12-381 Groth16 proving for Sotto's sealed-bid auction circuit.
// Mirrors the pipeline proven against the deployed verifier (`npm run prove:demo`).
import crypto from "crypto";

// ---- soroban bls12-381 byte serialization ----
// G1 = be(x,48)||be(y,48); G2 = be(Xc1)||be(Xc0)||be(Yc1)||be(Yc0); Fr = be(v,32)
function beBytes(dec: string, len: number): Uint8Array {
  const h = BigInt(dec)
    .toString(16)
    .padStart(len * 2, "0");
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++)
    out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function g1Bytes(p: string[]): Uint8Array {
  const o = new Uint8Array(96);
  o.set(beBytes(p[0], 48), 0);
  o.set(beBytes(p[1], 48), 48);
  return o;
}
function g2Bytes(p: string[][]): Uint8Array {
  const o = new Uint8Array(192);
  o.set(beBytes(p[0][1], 48), 0);
  o.set(beBytes(p[0][0], 48), 48);
  o.set(beBytes(p[1][1], 48), 96);
  o.set(beBytes(p[1][0], 48), 144);
  return o;
}

export function serializeProof(proof: {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
}): Uint8Array {
  const out = new Uint8Array(384);
  out.set(g1Bytes(proof.pi_a), 0);
  out.set(g2Bytes(proof.pi_b), 96);
  out.set(g1Bytes(proof.pi_c), 288);
  return out;
}
export function serializePublicInputs(publicSignals: string[]): Uint8Array[] {
  return publicSignals.map((v) => beBytes(v, 32));
}

/** Coerce a salt (number / decimal / hex string) to a field-element string. */
export function toField(v: string | number): string {
  if (typeof v === "number") return Math.trunc(v).toString();
  if (/^\d+$/.test(v)) return v;
  if (/^(0x)?[0-9a-fA-F]+$/.test(v))
    return BigInt(v.startsWith("0x") ? v : "0x" + v).toString();
  // arbitrary string -> sha256 mod 2^248
  const h = crypto.createHash("sha256").update(v).digest("hex");
  return BigInt("0x" + h.slice(0, 62)).toString();
}

export interface AuctionBid {
  amount: number;
  salt: string | number;
}

export class SottoProver {
  constructor(
    private zkeyUrl = "/zk/verify.zkey",
    private wasmUrl = "/zk/verify.wasm",
    private genWasmUrl = "/zk/gen_sotto.wasm",
  ) {}

  /**
   * Generate a REAL Groth16 proof that the winner is the lowest valid sealed bid.
   * `bids` is the full set (the circuit is fixed at 3; fewer are padded with bids
   * at maxBudget, more are truncated). `winnerIndex` indexes the lowest bid.
   */
  public async proveAuction(args: {
    bids: AuctionBid[];
    winnerIndex: number;
    maxBudget: number;
    reservePrice: number;
  }): Promise<{ proof: Uint8Array; publicInputs: Uint8Array[] }> {
    const snarkjs = await import("snarkjs");
    const N = 3;

    // normalize to exactly N bids
    const padded: AuctionBid[] = args.bids.slice(0, N).map((b) => ({
      amount: Math.trunc(b.amount),
      salt: toField(b.salt),
    }));
    while (padded.length < N)
      padded.push({
        amount: args.maxBudget,
        salt: toField(crypto.randomBytes(8).toString("hex")),
      });

    const competitorBids = padded.map((b) => String(b.amount));
    const competitorSalts = padded.map((b) => String(b.salt));
    const winnerIndex = Math.min(args.winnerIndex, N - 1);
    const winnerBid = competitorBids[winnerIndex];
    const winnerSalt = competitorSalts[winnerIndex];

    // derive commitments via the helper circuit (Poseidon over bls12-381)
    await snarkjs.wtns.calculate(
      { bids: competitorBids, salts: competitorSalts },
      this.genWasmUrl,
      "gen.wtns",
    );
    const w = await snarkjs.wtns.exportJson("gen.wtns");
    const commitments = [w[1].toString(), w[2].toString(), w[3].toString()];

    const input = {
      maxBudget: String(args.maxBudget),
      reservePrice: String(args.reservePrice),
      commitments,
      winnerIndex: String(winnerIndex),
      winnerBid,
      winnerSalt,
      competitorBids,
      competitorSalts,
    };

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      this.wasmUrl,
      this.zkeyUrl,
    );
    return {
      proof: serializeProof(proof as never),
      publicInputs: serializePublicInputs(publicSignals as string[]),
    };
  }
}
