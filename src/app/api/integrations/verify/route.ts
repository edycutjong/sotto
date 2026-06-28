import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: "online",
    network: "testnet",
    contracts: {
      auction_settlement:
        process.env.NEXT_PUBLIC_AUCTION_CONTRACT_ID ||
        "CB7A32J4K24L5MXB932NLAOSJDH732LA0S8D7S6A8D9S0A8D7SGA8D9D",
      verifier:
        process.env.NEXT_PUBLIC_VERIFIER_CONTRACT_ID ||
        "CC9S8D7S6A5D4F3G2H1J0K9L8M7N6B5V4C3X2Z1A0S8D7F6G5H4J3K2L1M0",
    },
    active_auctions: 12,
    protocol_version: 25
  }, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
