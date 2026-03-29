/**
 * @mss/voice-command - Intent Parser Tests
 */

import { describe, it, expect } from "vitest";
import { IntentParser, createIntentParser } from "../src/intent";

describe("IntentParser", () => {
  let parser: IntentParser;

  beforeEach(() => {
    parser = createIntentParser();
  });

  describe("Basic Commands", () => {
    it("should parse 'Deploy SAK' as deploy action", () => {
      const result = parser.parse("Deploy SAK");
      expect(result.intent.action).toBe("deploy");
      expect(result.intent.target).toBe("SAK");
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it("should parse 'deploy the project' as deploy action", () => {
      const result = parser.parse("deploy the project");
      expect(result.intent.action).toBe("deploy");
      expect(result.intent.target).toBe("project");
    });

    it("should parse 'Check errors' as diagnose action with errors scope", () => {
      const result = parser.parse("Check errors");
      expect(result.intent.action).toBe("diagnose");
      expect(result.intent.scope).toBe("errors");
    });

    it("should parse 'Check logs' as diagnose action with logs scope", () => {
      const result = parser.parse("Check logs");
      expect(result.intent.action).toBe("diagnose");
      expect(result.intent.scope).toBe("logs");
    });

    it("should parse 'Show roadmap' as fetch action with roadmap resource", () => {
      const result = parser.parse("Show roadmap");
      expect(result.intent.action).toBe("fetch");
      expect(result.intent.resource).toBe("roadmap");
    });

    it("should parse 'Show status' as fetch action with status resource", () => {
      const result = parser.parse("Show status");
      expect(result.intent.action).toBe("fetch");
      expect(result.intent.resource).toBe("status");
    });

    it("should parse 'List projects' as list action", () => {
      const result = parser.parse("List projects");
      expect(result.intent.action).toBe("list");
      expect(result.intent.target).toBe("projects");
    });

    it("should parse 'Run backup' as execute action", () => {
      const result = parser.parse("Run backup");
      expect(result.intent.action).toBe("execute");
      expect(result.intent.target).toBe("backup");
    });

    it("should parse 'Help' as help action", () => {
      const result = parser.parse("Help");
      expect(result.intent.action).toBe("help");
    });

    it("should parse 'Status' as status action", () => {
      const result = parser.parse("Status");
      expect(result.intent.action).toBe("status");
    });
  });

  describe("Complex Commands", () => {
    it("should parse 'Build the SAK project' as build action", () => {
      const result = parser.parse("Build the SAK project");
      expect(result.intent.action).toBe("build");
      expect(result.intent.target).toBe("SAK");
    });

    it("should parse 'Test the application' as test action", () => {
      const result = parser.parse("Test the application");
      expect(result.intent.action).toBe("test");
      expect(result.intent.target).toBe("application");
    });

    it("should parse 'Open config' as open action", () => {
      const result = parser.parse("Open config");
      expect(result.intent.action).toBe("open");
      expect(result.intent.target).toBe("config");
    });

    it("should parse 'Create project' as create action", () => {
      const result = parser.parse("Create project");
      expect(result.intent.action).toBe("create");
      expect(result.intent.target).toBe("project");
    });

    it("should parse 'Delete file' as delete action", () => {
      const result = parser.parse("Delete file");
      expect(result.intent.action).toBe("delete");
      expect(result.intent.target).toBe("file");
    });

    it("should parse 'Stop server' as stop action", () => {
      const result = parser.parse("Stop server");
      expect(result.intent.action).toBe("stop");
      expect(result.intent.target).toBe("server");
    });

    it("should parse 'Start server' as start action", () => {
      const result = parser.parse("Start server");
      expect(result.intent.action).toBe("start");
      expect(result.intent.target).toBe("server");
    });

    it("should parse 'Restart service' as restart action", () => {
      const result = parser.parse("Restart service");
      expect(result.intent.action).toBe("restart");
      expect(result.intent.target).toBe("service");
    });
  });

  describe("Confidence Scoring", () => {
    it("should return high confidence for exact match", () => {
      const exact = parser.parse("Deploy SAK");
      const partial = parser.parse("deploy");
      expect(exact.confidence).toBeGreaterThan(partial.confidence);
    });

    it("should return lower confidence for fuzzy matches", () => {
      const result = parser.parse("deply SAK"); // Typo
      expect(result.confidence).toBeLessThan(0.9);
    });

    it("should return low confidence for unknown commands", () => {
      const result = parser.parse("gibberish command xyz");
      expect(result.intent.action).toBe("unknown");
      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  describe("Ambiguity Detection", () => {
    it("should detect ambiguity for vague targets", () => {
      const result = parser.parse("Delete it");
      expect(result.ambiguity).toBe(true);
    });

    it("should flag clarification needed for high-risk actions without target", () => {
      const result = parser.parse("Deploy");
      expect(result.clarification_needed).toBe(true);
    });
  });

  describe("Clarification Prompts", () => {
    it("should generate clarification for ambiguous targets", () => {
      const result = parser.parse("Delete it");
      const prompt = parser.generateClarificationPrompt(result.intent);
      expect(prompt).toContain("delete");
    });

    it("should handle unknown commands gracefully in clarification", () => {
      const result = parser.parse("");
      const prompt = parser.generateClarificationPrompt(result.intent);
      expect(prompt).toContain("what would you like");
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty string", () => {
      const result = parser.parse("");
      expect(result.intent.action).toBe("unknown");
      expect(result.clarification_needed).toBe(true);
    });

    it("should handle whitespace-only string", () => {
      const result = parser.parse("   ");
      expect(result.intent.action).toBe("unknown");
    });

    it("should handle case-insensitive commands", () => {
      const lower = parser.parse("deploy sak");
      const upper = parser.parse("DEPLOY SAK");
      const mixed = parser.parse("dEpLoY SaK");
      expect(lower.intent.action).toBe(upper.intent.action);
      expect(upper.intent.action).toBe(mixed.intent.action);
    });
  });
});
