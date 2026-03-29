/**
 * @mss/approval-gate - Queue Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ApprovalQueue } from "../src/queue.js";
import type { RiskLevel } from "../src/schema.js";

describe("ApprovalQueue", () => {
  let queue: ApprovalQueue;

  beforeEach(() => {
    queue = new ApprovalQueue();
  });

  describe("create", () => {
    it("should create a new approval request", async () => {
      const request = await queue.create({
        action: "Send email to user@example.com",
        risk_level: "high",
        reversibility: false,
        proposed_by: "agent-1",
      });

      expect(request.id).toBeDefined();
      expect(request.action).toBe("Send email to user@example.com");
      expect(request.risk_level).toBe("high");
      expect(request.reversibility).toBe(false);
      expect(request.status).toBe("pending");
      expect(request.created_at).toBeDefined();
    });

    it("should use default timeout based on risk level", async () => {
      const lowRequest = await queue.create({
        action: "Read file",
        risk_level: "low",
        reversibility: true,
        proposed_by: "agent-1",
      });
      expect(lowRequest.timeout_ms).toBe(5 * 60 * 1000);

      const criticalRequest = await queue.create({
        action: "Delete database",
        risk_level: "critical",
        reversibility: false,
        proposed_by: "agent-1",
      });
      expect(criticalRequest.timeout_ms).toBe(30 * 1000);
    });

    it("should use custom timeout when provided", async () => {
      const request = await queue.create({
        action: "Custom timeout test",
        risk_level: "low",
        reversibility: true,
        timeout_ms: 60000,
        proposed_by: "agent-1",
      });
      expect(request.timeout_ms).toBe(60000);
    });
  });

  describe("getPending", () => {
    it("should return pending requests sorted by priority", async () => {
      await queue.create({
        action: "Low risk action",
        risk_level: "low",
        reversibility: true,
        proposed_by: "agent-1",
      });
      await queue.create({
        action: "Critical risk action",
        risk_level: "critical",
        reversibility: false,
        proposed_by: "agent-1",
      });
      await queue.create({
        action: "High risk action",
        risk_level: "high",
        reversibility: false,
        proposed_by: "agent-1",
      });

      const pending = queue.getPending();
      expect(pending).toHaveLength(3);
      expect(pending[0].risk_level).toBe("critical");
      expect(pending[1].risk_level).toBe("high");
      expect(pending[2].risk_level).toBe("low");
    });
  });

  describe("approve", () => {
    it("should approve a pending request", async () => {
      const request = await queue.create({
        action: "Test approval",
        risk_level: "medium",
        reversibility: true,
        proposed_by: "agent-1",
      });

      const approved = await queue.approve(request.id, "user@example.com");
      expect(approved).not.toBeNull();
      expect(approved!.status).toBe("approved");
    });

    it("should return null for non-existent request", async () => {
      const result = await queue.approve("non-existent", "user@example.com");
      expect(result).toBeNull();
    });

    it("should return null for already processed request", async () => {
      const request = await queue.create({
        action: "Test double approval",
        risk_level: "medium",
        reversibility: true,
        proposed_by: "agent-1",
      });

      await queue.approve(request.id, "user@example.com");
      const second = await queue.approve(request.id, "user@example.com");
      expect(second).toBeNull();
    });
  });

  describe("deny", () => {
    it("should deny a pending request", async () => {
      const request = await queue.create({
        action: "Test denial",
        risk_level: "medium",
        reversibility: true,
        proposed_by: "agent-1",
      });

      const denied = await queue.deny(request.id, "user@example.com");
      expect(denied).not.toBeNull();
      expect(denied!.status).toBe("denied");
    });

    it("should return null for non-existent request", async () => {
      const result = await queue.deny("non-existent", "user@example.com");
      expect(result).toBeNull();
    });
  });

  describe("stats", () => {
    it("should return correct queue statistics", async () => {
      await queue.create({
        action: "Low 1",
        risk_level: "low",
        reversibility: true,
        proposed_by: "agent-1",
      });
      await queue.create({
        action: "Medium 1",
        risk_level: "medium",
        reversibility: true,
        proposed_by: "agent-1",
      });
      await queue.create({
        action: "Critical 1",
        risk_level: "critical",
        reversibility: false,
        proposed_by: "agent-1",
      });

      const stats = queue.stats();
      expect(stats.pending).toBe(3);
      expect(stats.by_risk.low).toBe(1);
      expect(stats.by_risk.medium).toBe(1);
      expect(stats.by_risk.critical).toBe(1);
      expect(stats.by_risk.high).toBe(0);
    });
  });

  describe("auto-expire behavior", () => {
    it("should auto-approve reversible requests on timeout", async () => {
      const fastQueue = new ApprovalQueue({
        autoExpire: true,
        autoApproveReversible: true,
      });

      const request = await fastQueue.create({
        action: "Auto-approve test",
        risk_level: "medium",
        reversibility: true,
        timeout_ms: 100,
        proposed_by: "agent-1",
      });

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 200));

      const expired = fastQueue.get(request.id);
      expect(expired?.status).toBe("approved"); // Auto-approved due to reversibility
    });

    it("should not auto-approve irreversible requests on timeout", async () => {
      const fastQueue = new ApprovalQueue({
        autoExpire: true,
        autoApproveReversible: false,
      });

      const request = await fastQueue.create({
        action: "Irreversible auto-expire test",
        risk_level: "high",
        reversibility: false,
        timeout_ms: 100,
        proposed_by: "agent-1",
      });

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 200));

      const expired = fastQueue.get(request.id);
      expect(expired?.status).toBe("expired");
    });
  });
});
