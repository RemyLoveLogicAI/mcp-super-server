/**
 * Persistence Validation Runner
 * Usage: pnpm tsx scripts/validate-persistence.ts
 */

import { validatePersistence } from "../packages/ledger/src/persistence-test";

console.log("🧪 MCP Super-Server Persistence Validation");
console.log("==========================================\n");

const results = await validatePersistence();

if (results.length === 0) {
  console.log("\n⚠️  Supabase credentials not configured");
  console.log("To run persistence tests, set:");
  console.log("  export SUPABASE_URL=your-project-url");
  console.log("  export SUPABASE_SERVICE_ROLE_KEY=your-service-key");
  console.log("\nThen run migration first:");
  console.log("  pnpm --filter @mss/ledger migrate");
  console.log("\nThen run this validation:");
  console.log("  pnpm tsx scripts/validate-persistence.ts");
} else {
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}
