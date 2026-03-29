/**
 * @mss/voice-command - Intent Parser
 * Parses voice transcripts into structured commands
 */

import { VoiceCommandIntentSchema, type VoiceCommandIntent } from "./types";

// ============================================================================
// Command Patterns
// ============================================================================

type CommandAction = string;

interface ParsedIntent {
  action: CommandAction;
  target?: string;
  resource?: string;
  scope?: string;
  modifiers?: string[];
  confidence: number;
  original_text: string;
}

interface CommandPattern {
  pattern: RegExp;
  action: CommandAction;
  extractors: Record<string, (match: RegExpMatchArray) => string | undefined>;
}

const COMMAND_PATTERNS: CommandPattern[] = [
  {
    // "Deploy [project]" or "deploy the SAK project"
    pattern: /^deploy\s+(?:the\s+)?(.+?)(?:\s+project)?$/i,
    action: "deploy",
    extractors: { target: (m) => m[1]?.trim() },
  },
  {
    // "Check errors" or "check for errors"
    pattern: /^check\s*(?:for\s+)?errors?$/i,
    action: "diagnose",
    extractors: { scope: () => "errors" },
  },
  {
    // "Check logs" or "check the logs"
    pattern: /^check\s*(?:the\s+)?logs?$/i,
    action: "diagnose",
    extractors: { scope: () => "logs" },
  },
  {
    // "Show roadmap" or "show me the roadmap"
    pattern: /^show\s*(?:me\s+)?(?:the\s+)?roadmap$/i,
    action: "fetch",
    extractors: { resource: () => "roadmap" },
  },
  {
    // "Show status" or "what's the status"
    pattern: /^show\s*(?:me\s+)?(?:the\s+)?status$/i,
    action: "fetch",
    extractors: { resource: () => "status" },
  },
  {
    // "List projects" or "list all projects"
    pattern: /^list\s*(?:all\s+)?projects?$/i,
    action: "list",
    extractors: { target: () => "projects" },
  },
  {
    // "List resources" or "list [resource]"
    pattern: /^list\s+(?:all\s+)?(.+)$/i,
    action: "list",
    extractors: { target: (m) => m[1]?.trim() },
  },
  {
    // "Run [script]" or "run the backup script"
    pattern: /^run\s+(?:the\s+)?(.+?)(?:\s+script)?$/i,
    action: "execute",
    extractors: { target: (m) => m[1]?.trim() },
  },
  {
    // "Build [project]" or "build it"
    pattern: /^build\s+(?:the\s+)?(.+?)(?:\s+project)?$/i,
    action: "build",
    extractors: { target: (m) => m[1]?.trim() },
  },
  {
    // "Test [project]" or "run tests"
    pattern: /^test\s+(?:the\s+)?(.+?)(?:\s+project)?$/i,
    action: "test",
    extractors: { target: (m) => m[1]?.trim() },
  },
  {
    // "Open [file]" or "open the config"
    pattern: /^open\s+(?:the\s+)?(.+?)(?:\s+file)?$/i,
    action: "open",
    extractors: { target: (m) => m[1]?.trim() },
  },
  {
    // "Create [resource]" or "create a new project"
    pattern: /^create\s+(?:a\s+)?(?:new\s+)?(.+)$/i,
    action: "create",
    extractors: { target: (m) => m[1]?.trim() },
  },
  {
    // "Delete [resource]" or "delete the file"
    pattern: /^delete\s+(?:the\s+)?(.+)$/i,
    action: "delete",
    extractors: { target: (m) => m[1]?.trim() },
  },
  {
    // "Stop [process]" or "stop the server"
    pattern: /^stop\s+(?:the\s+)?(.+)$/i,
    action: "stop",
    extractors: { target: (m) => m[1]?.trim() },
  },
  {
    // "Start [process]" or "start the server"
    pattern: /^start\s+(?:the\s+)?(.+)$/i,
    action: "start",
    extractors: { target: (m) => m[1]?.trim() },
  },
  {
    // "Restart [process]"
    pattern: /^restart\s+(?:the\s+)?(.+)$/i,
    action: "restart",
    extractors: { target: (m) => m[1]?.trim() },
  },
  {
    // "Help" or "what can I say"
    pattern: /^(?:help|what\s+(?:can\s+I\s+)?(?:say|do))$/i,
    action: "help",
    extractors: {},
  },
  {
    // "Status" or "how are you"
    pattern: /^(?:status|how\s+are\s+you)$/i,
    action: "status",
    extractors: {},
  },
];

// ============================================================================
// Intent Parser
// ============================================================================

export interface IntentParseResult {
  intent: VoiceCommandIntent;
  confidence: number;
  ambiguity: boolean;
  clarification_needed: boolean;
}

export class IntentParser {
  /**
   * Parse a voice transcript into a structured intent
   */
  parse(transcript: string): IntentParseResult {
    const normalizedTranscript = transcript.trim();

    if (!normalizedTranscript) {
      const intent = VoiceCommandIntentSchema.parse({
        action: "unknown",
        confidence: 0,
        ambiguity: false,
        clarification_needed: true,
        original_text: transcript,
      });
      return {
        intent,
        confidence: 0,
        ambiguity: false,
        clarification_needed: true,
      };
    }

    // Try to match against known patterns
    for (const { pattern, action, extractors } of COMMAND_PATTERNS) {
      const match = normalizedTranscript.match(pattern);
      if (match) {
        const parsed: ParsedIntent = {
          action,
          confidence: this.calculateConfidence(match, normalizedTranscript),
          original_text: transcript,
        };

        // Apply extractors
        for (const [key, extractor] of Object.entries(extractors)) {
          const value = extractor(match);
          if (value !== undefined) {
            (parsed as unknown as Record<string, unknown>)[key] = value;
          }
        }

        const intent = VoiceCommandIntentSchema.parse(parsed);
        const ambiguity = this.detectAmbiguity(intent);

        return {
          intent,
          confidence: parsed.confidence,
          ambiguity,
          clarification_needed: ambiguity || this.needsClarification(intent),
        };
      }
    }

    // No pattern matched - try fuzzy matching
    const fuzzyResult = this.fuzzyMatch(normalizedTranscript, transcript);
    if (fuzzyResult) {
      return fuzzyResult;
    }

    // Unknown command
    const unknownIntent = VoiceCommandIntentSchema.parse({
      action: "unknown",
      confidence: 0.1,
      ambiguity: false,
      clarification_needed: true,
      original_text: transcript,
    });
    return {
      intent: unknownIntent,
      confidence: 0.1,
      ambiguity: false,
      clarification_needed: true,
    };
  }

  /**
   * Calculate confidence based on match quality
   */
  private calculateConfidence(match: RegExpMatchArray, transcript: string): number {
    let confidence = 0.7; // Base confidence for pattern match

    // Boost for full match vs partial
    if (match[0] === transcript) {
      confidence += 0.15;
    }

    // Boost for having extracted parameters
    if (match.length > 1 && match[1]?.trim()) {
      confidence += 0.1;
    }

    // Boost for common commands
    const commonActions = ["help", "status", "list", "check"];
    if (commonActions.includes(match[0].toLowerCase().split(/\s+/)[0] ?? "")) {
      confidence += 0.05;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Detect potential ambiguity in the intent
   */
  private detectAmbiguity(intent: VoiceCommandIntent): boolean {
    // Check if target is too vague
    if (intent.target) {
      const vagueTargets = ["it", "this", "that", "something", "stuff"];
      if (vagueTargets.includes(intent.target.toLowerCase())) {
        return true;
      }
    }

    // Check for conflicting actions
    if (intent.modifiers && intent.modifiers.length > 2) {
      return true;
    }

    return false;
  }

  /**
   * Determine if clarification is needed
   */
  private needsClarification(intent: VoiceCommandIntent): boolean {
    // High-risk actions always need clarification
    const highRiskActions = ["delete", "deploy", "restart", "stop"];
    if (highRiskActions.includes(intent.action) && !intent.target) {
      return true;
    }

    // Low confidence needs clarification
    if (intent.confidence < 0.6) {
      return true;
    }

    return false;
  }

  /**
   * Attempt fuzzy matching for unknown commands
   */
  private fuzzyMatch(normalizedTranscript: string, originalTranscript: string): IntentParseResult | null {
    // Check for partial matches
    for (const { pattern, action, extractors } of COMMAND_PATTERNS) {
      // Check if the transcript starts with a known action word
      const actionWords = ["deploy", "check", "show", "list", "run", "build", "test", "open", "create", "delete", "stop", "start", "restart", "help"];
      for (const word of actionWords) {
        if (normalizedTranscript.startsWith(word + " ") || normalizedTranscript === word) {
          // Try matching just the first part
          const partialMatch = normalizedTranscript.match(new RegExp(`^${word}\\s+(.+)$`, "i"));
          if (partialMatch) {
            const parsed: ParsedIntent = {
              action,
              confidence: 0.5, // Lower confidence for fuzzy match
              original_text: originalTranscript,
            };

            for (const [key, extractor] of Object.entries(extractors)) {
              const value = extractor(partialMatch);
              if (value !== undefined) {
                (parsed as unknown as Record<string, unknown>)[key] = value;
              }
            }

            const intent = VoiceCommandIntentSchema.parse(parsed);
            return {
              intent,
              confidence: 0.5,
              ambiguity: true,
              clarification_needed: true,
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * Generate a clarification prompt for ambiguous commands
   */
  generateClarificationPrompt(intent: VoiceCommandIntent): string {
    if (!intent.target && !intent.resource) {
      return `I heard "${intent.action}", but what would you like to ${intent.action}?`;
    }

    if (intent.ambiguity) {
      return `I understood "${intent.action} ${intent.target || intent.resource || ""}", but I'm not sure which ${intent.target || intent.resource} you mean. Could you be more specific?`;
    }

    return `I understood "${intent.action} ${intent.target || intent.resource || ""}". Is that correct?`;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createIntentParser(): IntentParser {
  return new IntentParser();
}
