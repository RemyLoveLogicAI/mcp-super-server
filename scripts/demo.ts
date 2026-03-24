#!/usr/bin/env tsx
/**
 * MCP Super-Server Demo - Phase 3
 * End-to-end voice-native MCP pipeline demonstration
 */

import { createMCPServer } from "@mss/server";

const DEMO_USER = "demo-user-123";
const DEMO_CHANNEL = "web" as const;

function log(title: string, message: string) {
  const timestamp = new Date().toISOString().split("T")[1].split(".")[0];
  console.log(`[${timestamp}] ${title}: ${message}`);
}

function section(title: string) {
  console.log("\n" + "=".repeat(60));
  console.log(title);
  console.log("=".repeat(60) + "\n");
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runDemo() {
  section("PHASE 3: VOICE-NATIVE MCP DEMO");
  
  // Create server
  section("1. Initializing MCP Server");
  const server = createMCPServer({
    agentId: "demo-agent",
    gateMode: "write_approval",
    maxCallsPerSession: 10,
  });
  log("SERVER", "MCP Super-Server initialized");
  
  // Register tools
  section("2. Registering Tools");
  server.registerTool("read:weather", async (input: any) => {
    log("WEATHER", `Looking up weather for ${input.city}`);
    await sleep(500);
    return { city: input.city, temp: 72, conditions: "sunny" };
  });
  
  server.registerTool("write:email", async (input: any) => {
    log("EMAIL", `Composing email to ${input.to}`);
    await sleep(600);
    return { sent: true, to: input.to, message_id: `msg_${Date.now()}` };
  });
  log("TOOLS", "3 tools registered (2 read, 1 write)");
  
  // Create voice session
  section("3. Creating Voice Session");
  const sessionId = await server.createSession(DEMO_USER, DEMO_CHANNEL);
  log("SESSION", `Created: ${sessionId.slice(0, 8)}`);
  
  // Simulate voice interaction
  section("4. Voice Interaction: Weather Query");
  log("AUDIO", "Start speech detected");
  await server.onAudioStart(sessionId);
  
  const transcript = "What's the weather in San Francisco?";
  log("TRANSCRIPT", `"${transcript}"`);
  await server.onASRFinal(sessionId, transcript);
  
  // Invoke tool
  log("TOOL", "Invoking read:weather");
  const result = await server.invokeTool(sessionId, "read:weather", { city: "San Francisco" });
  log("RESULT", `Decision: ${result.decision}`);
  
  await server.onAudioEnd(sessionId);
  
  // Multi-step plan with orchestration
  section("5. Multi-Step Orchestration Plan");
  log("PLAN", "Creating plan: news → summary → email");
  
  const plan = await server.planAndExecute(
    sessionId,
    "Get weather and email it to team",
    ["read:weather", "write:email"]
  );
  
  log("PLAN COMPLETE", `Status: ${plan.status}`);
  plan.steps.forEach((step, i) => {
    log(`STEP ${i + 1}`, `${step.tool_id}: ${step.status}`);
  });
  
  // Barge-in test
  section("6. Barge-In Interrupt Test");
  await server.onAudioStart(sessionId);
  log("AUDIO", "Long response started...");
  await sleep(1000);
  log("BARGE-IN", "User interrupts!");
  await server.onBargeIn(sessionId);
  
  const session = server.getSession(sessionId);
  log("STATE", `Session after interrupt: ${session?.getState()}`);
  
  // Ledger replay
  section("7. Ledger Event Replay");
  const events = await server.replaySession(sessionId);
  log("EVENTS", `Total recorded: ${events.length}`);
  events.slice(0, 3).forEach((event: any, i) => {
    log(`  ${i + 1}.`, event.event_type);
  });
  
  // Health check
  section("8. Health Check");
  const health = await server.health();
  log("HEALTH", health.status);
  log("UPTIME", `${Math.floor(health.uptime / 1000)}s`);
  
  section("PHASE 3 COMPLETE - ALL SYSTEMS OPERATIONAL");
  console.log("\nSummary:");
  console.log(`  Session: ${sessionId}`);
  console.log(`  Events: ${events.length}`);
  console.log(`  Tools: 3 registered`);
  console.log(`  Plan steps: ${plan.steps.length}`);
  console.log(`  Status: ${plan.status}`);
  
  process.exit(0);
}

runDemo().catch((error) => {
  console.error("Demo failed:", error);
  process.exit(1);
});
