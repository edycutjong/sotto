import { buildEddsa, buildPoseidon } from "circomlibjs";

async function main() {
  const eddsa = await buildEddsa();
  const poseidon = await buildPoseidon();

  const prvKey = Buffer.from(
    "0001020304050607080900010203040506070809000102030405060708090001",
    "hex",
  );
  const pubKey = eddsa.prv2pub(prvKey);
  console.log("pubKey X:", eddsa.F.toObject(pubKey[0]).toString());
  console.log("pubKey Y:", eddsa.F.toObject(pubKey[1]).toString());

  const msg = poseidon([50, 123]); // Poseidon(winnerBid, winnerSalt)
  const sig = eddsa.signPoseidon(prvKey, msg);

  console.log("sig.R8 X:", eddsa.F.toObject(sig.R8[0]).toString());
  console.log("sig.R8 Y:", eddsa.F.toObject(sig.R8[1]).toString());
  console.log("sig.S:", sig.S.toString());
}

main().catch(console.error);
