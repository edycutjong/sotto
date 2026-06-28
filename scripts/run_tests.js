const { execSync } = require('child_process');

console.log("============================================================");
console.log("SOTTO CRYPTOGRAPHIC PROTOCOL TEST SUITE RUNNER");
console.log("============================================================");

try {
  console.log("Executing Jest test suite...");
  execSync('npx jest --colors', { stdio: 'inherit' });
  console.log("============================================================");
  console.log("✅ All Sotto tests passed successfully!");
  console.log("============================================================");
  process.exit(0);
} catch (error) {
  console.error("============================================================");
  console.error("❌ Sotto test suite execution failed!");
  console.error("============================================================");
  process.exit(1);
}
