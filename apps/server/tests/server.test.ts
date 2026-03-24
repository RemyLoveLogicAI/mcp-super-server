/**
 * @mss/server - Integration Tests
 * Tests for MCPSuperServer composition
 */

import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { MCPSuperServer, createServer } from "../src/index";
import { generateToolId } from "@mss/core/testing";
import type { ToolDescriptor } from "@mss/core/resources";
import type { GateContext } from "@mss/core/policies/gates";
import type { SessionId, ToolId, CapabilityTag } from "@mss/core/ids";

function createTestTool(overrides: Partial<ToolDescriptor> = {}): ToolDescriptor {
  return {
    tool_id: generateToolId() as ToolId,
    version: "1.0.0",
    name: "Test Tool",
    description: "A test tool",
    capabilities: ["test" as CapabilityTag],
    side_effect_class: "read_only",
    min_trust_tier: undefined,
    schema_hash: "abc123",
    expected_latency_ms: 100,
    available: true,
    ...overrides,
  };
}

describe("MCPSuperServer", () => {
  let server: MCPSuperServer;

  beforeEach(async () => {
    server = createServer({
      ledger: { type: "memory" },
      gate: {
        maxCallsPerSession: 5,
        defaultApproval: "auto",
      },
      meta: {
        name: "test-server",
        version: "0.0.1-test",
        environment: "development",
      },
    });
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  describe("identity resolution", () => {
    it("should resolve new identity", async () => {
      const result = await server.resolveIdentity("discord", "user123");

      expect(result.canonicalUserId).toBeTruthy();
      expect(result.isNew).toBe(true);
    });

    it("should resolve existing identity", async () => {
      const first = await server.resolveIdentity("discord", "user123");
      const second = await server.resolveIdentity("discord", "user123");

      expect(second.canonicalUserId).toBe(first.canonicalUserId);
      expect(second.isNew).toBe(false);
    });
  });

  describe("voice sessions", () => {
    it("should create voice session", async () => {
      const identity = await server.resolveIdentity("discord", "user123");
      const { sessionId, fsm } = server.createVoiceSession(
        identity.canonicalUserId,
        "discord"
      );

      expect(sessionId).toBeTruthy();
      expect(fsm.getState()).toBe("idle");
    });

    it("should process voice events", async () => {
      const identity = await server.resolveIdentity("discord", "user123");
      const { sessionId } = server.createVoiceSession(
        identity.canonicalUserId,
        "discord"
      );

      // Start listening
      const result1 = await server.processVoiceEvent(sessionId, { type: "AUDIO_START" });
      expect(result1.state).toBe("listening");
      expect(result1.effects).toContain("emit_turn_started");

      // ASR final
      const result2 = await server.processVoiceEvent(sessionId, {
        type: "ASR_FINAL",
        text: "hello world",
      });
      expect(result2.state).toBe("processing");
    });

    it("should get existing session", async () => {
      const identity = await server.resolveIdentity("discord", "user123");
      const { sessionId } = server.createVoiceSession(
        identity.canonicalUserId,
        "discord"
      );

      const session = server.getVoiceSession(sessionId);
      expect(session).toBeTruthy();
    });

    it("should end voice session", async () => {
      const identity = await server.resolveIdentity("discord", "user123");
      const { sessionId } = server.createVoiceSession(
        identity.canonicalUserId,
        "discord"
      );

      server.endVoiceSession(sessionId);

      expect(server.getVoiceSession(sessionId)).toBeUndefined();
    });

    it("should throw for unknown session", async () => {
      expect(() =>
        server.processVoiceEvent("unknown" as SessionId, { type: "AUDIO_START" })
      ).toThrow("not found");
    });
  });

  describe("tool gate", () => {
    it("should allow registered tools", async () => {
      const tool = createTestTool();
      server.registerTool(tool);

      const identity = await server.resolveIdentity("discord", "user123");
      const { sessionId } = server.createVoiceSession(
        identity.canonicalUserId,
        "discord"
      );

      const result = await server.evaluateToolCall({
        canonical_user_id: identity.canonicalUserId,
        session_id: sessionId,
        tool_id: tool.tool_id,
        purpose: "test",
        requested_effect: "read_only",
        scopes: [],
        metadata: {},
      });

      expect(result.allowed).toBe(true);
    });

    it("should deny unregistered tools", async () => {
      const identity = await server.resolveIdentity("discord", "user123");
      const { sessionId } = server.createVoiceSession(
        identity.canonicalUserId,
        "discord"
      );

      const result = await server.evaluateToolCall({
        canonical_user_id: identity.canonicalUserId,
        session_id: sessionId,
        tool_id: "unknown:tool" as ToolId,
        purpose: "test",
        requested_effect: "read_only",
        scopes: [],
        metadata: {},
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("TOOL_NOT_FOUND");
    });

    it("should enforce budget limits", async () => {
      const tool = createTestTool();
      server.registerTool(tool);

      const identity = await server.resolveIdentity("discord", "user123");
      const { sessionId } = server.createVoiceSession(
        identity.canonicalUserId,
        "discord"
      );

      // Record max calls (5)
      for (let i = 0; i < 5; i++) {
        server.recordToolCall(sessionId, tool.tool_id);
      }

      // Next call should be denied
      const result = await server.evaluateToolCall({
        canonical_user_id: identity.canonicalUserId,
        session_id: sessionId,
        tool_id: tool.tool_id,
        purpose: "test",
        requested_effect: "read_only",
        scopes: [],
        metadata: {},
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("BUDGET_EXCEEDED");
    });
  });

  describe("ledger", () => {
    it("should expose ledger", () => {
      const ledger = server.getLedger();
      expect(ledger).toBeTruthy();
    });
  });

  describe("status", () => {
    it("should report status", () => {
      const status = server.getStatus();

      expect(status.version).toBe("0.0.1-test");
      expect(status.environment).toBe("development");
      expect(status.activeSessions).toBe(0);
    });

    it("should track active sessions", async () => {
      const identity = await server.resolveIdentity("discord", "user123");

      server.createVoiceSession(identity.canonicalUserId, "discord");
      server.createVoiceSession(identity.canonicalUserId, "telegram");

      expect(server.getStatus().activeSessions).toBe(2);
    });
  });
});

describe("createServer", () => {
  it("should create server with default config", () => {
    const server = createServer();
    expect(server).toBeInstanceOf(MCPSuperServer);
  });

  it("should accept partial config", () => {
    const server = createServer({
      gate: { maxCallsPerSession: 20, defaultApproval: "auto" },
    });
    expect(server).toBeInstanceOf(MCPSuperServer);
  });
});
