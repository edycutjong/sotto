import { rpc, TransactionBuilder, Networks, Contract, Address, nativeToScVal, xdr, Account, scValToNative } from "@stellar/stellar-sdk";
import * as fs from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(__dirname, "../circuits/build/fixture.json");
const VERIFIER = "CBN2R3T3L6EFLNPKGHRK5OIVNTKKUY6BTP2CQ7EIRN5CWDFGMEQVKVRA";

if (!fs.existsSync(fixturePath)) {
  console.error("fixture.json not found! Run npm run build first.");
  process.exit(1);
}

const f = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const server = new rpc.Server("https://soroban-testnet.stellar.org");

async function run() {
  const proofBuf = Buffer.from(f.proof.a + f.proof.b + f.proof.c, "hex");
  const pubInputs = f.pub.map(p => Buffer.from(p, "hex"));

  console.log("Simulating verify_proof via SDK...");
  console.log("Proof length:", proofBuf.length, "bytes");
  console.log("Public inputs count:", pubInputs.length);

  // Construct contract call
  const contract = new Contract(VERIFIER);
  const call = contract.call(
    "verify_proof",
    nativeToScVal(proofBuf),
    nativeToScVal(pubInputs)
  );

  // Simulating needs a dummy transaction from a valid source account.
  // We can use a random testnet address.
  const source = "GAZV4ZZRKEWHOHWSVKLX7VZVDGJ6GAVSPHMFDBYMS6WQ74DBYP3FOMMX";
  const account = new Address(source);

  const tx = new TransactionBuilder(
    new Account(source, "0"),
    {
      fee: "100",
      networkPassphrase: Networks.TESTNET,
    }
  )
    .addOperation(call)
    .setTimeout(30)
    .build();

  console.log("Submitting simulation request...");
  const sim = await server.simulateTransaction(tx);
  
  if (rpc.Api.isSimulationSuccess(sim)) {
    const resultScVal = sim.result.retval;
    const verified = scValToNative(resultScVal);
    console.log("Simulation succeeded! verify_proof returned:", verified);
    
    // Log the events if any
    if (sim.events) {
      console.log("Events:", sim.events.map(e => e.event.toXDR("base64")));
    }
  } else {
    console.error("Simulation failed:", sim.error || sim);
  }
}

run().catch(console.error);
