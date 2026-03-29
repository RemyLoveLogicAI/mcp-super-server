/**
 * @mss/approval-gate - Schema Tests
 */

import { describe, it, expect } from "vitest";
import {
  ApprovalRequestSchema,
  CreateApprovalRequestSchema,
  ApprovalStatusSchema,
  RiskLevelSchema,
  getDefaultTimeout,
  DEFAULT_TIMEOUTS,
} from "../src/schema.js";

describe("Schema Validation", () => {
  describe("RiskLevelSchema", () => {
    it("should accept valid risk levels", () => {
      expect(RiskLevelSchema.parse("low")).toBe("low");
      expect(RiskLevelSchema.parse("medium")).toBe("medium");
      expect(RiskLevelSchema.parse("high")).toBe("high");
      expect(RiskLevelSchema.parse("critical")).toBe("critical");
    });

    it("should reject invalid risk levels", () => {
      expect(() => RiskLevelSchema.parse("extreme")).toThrow();
      expect(() => RiskLevelSchema.parse("")).toThrow();
    });
  });

  describe("ApprovalStatusSchema", () => {
    it("should accept valid statuses", () => {
      expect(ApprovalStatusSchema.parse("pending")).toBe("pending");
      expect(ApprovalStatusSchema.parse("approved")).toBe("approved");
      expect(ApprovalStatusSchema.parse("denied")).toBe("denied");
      expect(ApprovalStatusSchema.parse("expired")).toBe("expired");
    });

    it("should reject invalid statuses", () => {
      expect(() => ApprovalStatusSchema.parse("rejected")).toThrow();
    });
  });

  describe("ApprovalRequestSchema", () => {
    it("should validate a complete approval request", () => {
      const request = {
        id: "req-123",
        action: "Send email",
        risk_level: "high",
        reversibility: false,
        timeout_ms: 60000,
        created_at: "2024-01-01T00:00:00.000Z",
        context: { to: "test@example.com" },
        proposed_by: "agent-1",
        status: "pending",
      };

      const parsed = ApprovalRequestSchema.parse(request);
      expect(parsed.id).toBe("req-123");
      expect(parsed.action).toBe("Send email");
    });

    it("should reject request with missing required fields", () => {
      expect(() =>
        ApprovalRequestSchema.parse({
          id: "req-123",
          // missing action
        })
      ).toThrow();
    });
  });

  describe("CreateApprovalRequestSchema", () => {
    it("should validate with minimal fields", () => {
      const result = CreateApprovalRequestSchema.parse({
        action: "Test action",
        risk_level: "low",
        reversibility: true,
        proposed_by: "agent-1",
      });

      expect(result.action).toBe("Test action");
      expect(result.context).toBeUndefined();
      expect(result.timeout_ms).toBeUndefined();
    });

    it("should validate with all optional fields", () => {
      const result = CreateApprovalRequestSchema.parse({
        action: "Full request",
        risk_level: "critical",
        reversibility: false,
        timeout_ms: 30000,
        context: { key: "value" },
        proposed_by: "agent-1",
      });

      expect(result.timeout_ms).toBe(30000);
      expect(result.context).toEqual({ key: "value" });
    });
  });

  describe("getDefaultTimeout", () => {
    it("should return correct timeouts for all risk levels", () => {
      expect(getDefaultTimeout("low")).toBe(DEFAULT_TIMEOUTS.low);
      expect(getDefaultTimeout("medium")).toBe(DEFAULT_TIMEOUTS.medium);
      expect(getDefaultTimeout("high")).toBe(DEFAULT_TIMEOUTS.high);
      expect(getDefaultTimeout("critical")).toBe(DEFAULT_TIMEOUTS.critical);
    });

    it("should have low risk as 5 minutes", () => {
      expect(getDefaultTimeout("low")).toBe(5 * 60 * 1000);
    });

    it("should have critical risk as 30 seconds", () => {
      expect(getDefaultTimeout("critical")).toBe(30 * 1000);
    });
  });
});
