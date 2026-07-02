import { NextResponse } from "next/server";
import {
  rpc,
  TransactionBuilder,
  Networks,
  Contract,
  nativeToScVal,
  Account,
  scValToNative,
} from "@stellar/stellar-sdk";
import fixture from "./proof.json";

// Re-verifies a REAL BN254 Groth16 sealed-bid auction proof against the
// deployed Soroban verifier via read-only simulation (no wallet, no fee).
// Real proof => true; byte-tampered public inputs => false. Makes the on-chain
// ZK verification witnessable in the browser, not just the CLI.

export const dynamic = "force-dynamic";

const RPC_URL =
  process.env.NEXT_PUBLIC_STELLAR_RPC_URL ||
  "https://soroban-testnet.stellar.org";
const VERIFIER = fixture.verifier;
const SOURCE = "GAZV4ZZRKEWHOHWSVKLX7VZVDGJ6GAVSPHMFDBYMS6WQ74DBYP3FOMMX";

async function verifyOnChain(
  proofHex: string,
  pubHex: string[],
): Promise<boolean> {
  const server = new rpc.Server(RPC_URL, {
    allowHttp: RPC_URL.startsWith("http://"),
  });
  const contract = new Contract(VERIFIER);
  const call = contract.call(
    "verify_proof",
    nativeToScVal(Buffer.from(proofHex, "hex")),
    nativeToScVal(pubHex.map((p) => Buffer.from(p, "hex"))),
  );
  const tx = new TransactionBuilder(new Account(SOURCE, "0"), {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(call)
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) return false;
  return String(scValToNative(sim.result.retval)) === "true";
}

export async function GET() {
  const pub: string[] = fixture.publicInputsHex;
  const tampered = [...pub];
  const last = tampered[tampered.length - 1];
  tampered[tampered.length - 1] =
    last.slice(0, -2) + (last.slice(-2) === "00" ? "01" : "00");

  try {
    const [validProof, tamperedProof] = await Promise.all([
      verifyOnChain(fixture.proofHex, pub),
      verifyOnChain(fixture.proofHex, tampered),
    ]);
    return NextResponse.json({
      network: "testnet",
      verifier: VERIFIER,
      entrypoint: "verify_proof",
      valid_proof: validProof,
      tampered_proof: tamperedProof,
      explorer: `https://stellar.expert/explorer/testnet/contract/${VERIFIER}`,
      note: "Real snarkjs BN254 Groth16 auction proof, re-verified live on the deployed Soroban verifier by read-only simulation. Tampered public inputs are rejected.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
