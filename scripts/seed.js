const crypto = require('crypto');

const bids = [
  { bidder: "GS111", amount: 720000, salt: 829482 },
  { bidder: "GS222", amount: 650000, salt: 192849 }, // Winner
  { bidder: "GS333", amount: 800000, salt: 928471 }
];

function poseidon2Mock(val1, val2) {
  const hasher = crypto.createHash('sha256');
  hasher.update(`${val1}-${val2}`);
  return hasher.digest('hex');
}

function generateBidCommitments() {
  console.log("Generating Sotto Sealed-Bid Commitments...");
  console.log("=========================================");
  bids.forEach(b => {
    const commit = poseidon2Mock(b.amount, b.salt);
    console.log(`Bidder Address : ${b.bidder}`);
    console.log(`Private Bid    : $${b.amount.toLocaleString()} USDC`);
    console.log(`Blinding Salt  : ${b.salt}`);
    console.log(`Commitment Hash: ${commit}`);
    console.log("-----------------------------------------");
  });
}

if (require.main === module) {
  generateBidCommitments();
}

module.exports = {
  bids,
  poseidon2Mock,
  generateBidCommitments
};
