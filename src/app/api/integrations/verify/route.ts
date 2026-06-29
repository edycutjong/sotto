import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      status: "online",
      network: "testnet",
      contracts: {
        auction_settlement:
          process.env.NEXT_PUBLIC_AUCTION_CONTRACT_ID ||
          "CAFAQ3LCQFHRQ4A2H2HTJEHODQF2NAAZWU7TYT5ZYI7L4TTP7DMQFBTO",
        verifier:
          process.env.NEXT_PUBLIC_VERIFIER_CONTRACT_ID ||
          "CBN2R3T3L6EFLNPKGHRK5OIVNTKKUY6BTP2CQ7EIRN5CWDFGMEQVKVRA",
      },
      verify_entrypoint: "verify_proof",
      note: "Real BN254 Groth16 sealed-bid verification is reproduced via `npm run prove:demo`.",
      protocol_version: 25,
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    },
  );
}
