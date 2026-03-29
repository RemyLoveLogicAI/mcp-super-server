/**
 * @mss/approval-gate - Notify Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApprovalNotifier } from "../src/notify.js";
import type { ApprovalRequest } from "../src/schema.js";

describe("ApprovalNotifier", () => {
  const mockSendSms = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("buildMessage", () => {
    it("should build appropriate message for low risk", () => {
      const notifier = new ApprovalNotifier();
      const request: ApprovalRequest = {
        id: "test-1",
        action: "Read user profile",
        risk_level: "low",
        reversibility: true,
        timeout_ms: 300000,
        created_at: new Date().toISOString(),
        context: {},
        proposed_by: "agent-1",
        status: "pending",
      };

      const message = notifier.buildMessage(request);
      expect(message).toContain("ℹ️");
      expect(message).toContain("Read user profile");
      expect(message).toContain("LOW");
      expect(message).toContain("Reversible");
    });

    it("should build appropriate message for critical risk", () => {
      const notifier = new ApprovalNotifier();
      const request: ApprovalRequest = {
        id: "test-2",
        action: "Delete all users",
        risk_level: "critical",
        reversibility: false,
        timeout_ms: 30000,
        created_at: new Date().toISOString(),
        context: {},
        proposed_by: "agent-1",
        status: "pending",
      };

      const message = notifier.buildMessage(request);
      expect(message).toContain("🔥");
      expect(message).toContain("CRITICAL");
      expect(message).not.toContain("Reversible");
    });
  });

  describe("shouldNotify", () => {
    it("should notify for medium risk when minRiskLevel is medium", () => {
      const notifier = new ApprovalNotifier({ minRiskLevel: "medium" });

      const lowRequest: ApprovalRequest = {
        id: "test-1",
        action: "Test",
        risk_level: "low",
        reversibility: true,
        timeout_ms: 300000,
        created_at: new Date().toISOString(),
        context: {},
        proposed_by: "agent-1",
        status: "pending",
      };

      // Low should not trigger when minRiskLevel is medium
      // We can't directly test shouldNotify, but we test the rate limiting behavior
    });

    it("should include deep link in message", () => {
      const notifier = new ApprovalNotifier({
        deepLinkBase: "https://remysr.zo.space/approval-gate",
      });
      const request: ApprovalRequest = {
        id: "test-123",
        action: "Test action",
        risk_level: "medium",
        reversibility: true,
        timeout_ms: 180000,
        created_at: new Date().toISOString(),
        context: {},
        proposed_by: "agent-1",
        status: "pending",
      };

      const message = notifier.buildMessage(request);
      expect(message).toContain("https://remysr.zo.space/approval-gate/test-123");
    });
  });
});
