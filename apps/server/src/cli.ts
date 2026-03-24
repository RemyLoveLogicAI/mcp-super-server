#!/usr/bin/env node

/**
 * @mss/server — CLI Runner
 * MCP Super-Server executable for end-to-end testing
 */

import { createMCPServer } from "./server.js";

const server = createMCPServer();

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           MCP SUPER-SERVER CLI                                ║
╠═══════════════════════════════════════════════════════════════╣
║  Voice-first MCP server with orchestration + context fabric   ║
╚═══════════════════════════════════════════════════════════════╝
  `);

  const { sessionId } = server.createVoiceSession("user_001", "custom");
  console.log(`Created session: ${sessionId}`);

  const result = await server.invokeTool(sessionId, "read:file", { path: "/tmp/demo.txt" });
  console.log(`Tool result:`, result);

  const plan = await server.planAndExecute(sessionId, "demo goal", ["weather", "search"]);
  console.log(`Plan result:`, await plan);

  const identity = await server.linkIdentity("custom", "user_cli_001");
  console.log(`Identity:`, identity);

  const events = await server.replaySession(sessionId);
  console.log(`Session had ${events.length} events`);

  console.log("\n✅ CLI test complete!");
}

main().catch(console.error);
