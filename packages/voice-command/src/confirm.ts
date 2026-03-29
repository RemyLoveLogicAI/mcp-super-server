/**
 * @mss/voice-command - Confirmation Dialogs
 * Voice-based confirmation for high-risk actions
 */

import {
  ConfirmationRequestSchema,
  ConfirmationResponseSchema,
  type ConfirmationRequest,
  type ConfirmationResponse,
} from "./types";

// ============================================================================
// Confirmation Types
// ============================================================================

export interface ConfirmationConfig {
  defaultTimeoutMs: number;
  retryPrompt: string;
  maxRetries: number;
}

const DEFAULT_CONFIRMATION_CONFIG: ConfirmationConfig = {
  defaultTimeoutMs: 30000,
  retryPrompt: "Please say yes or no",
  maxRetries: 3,
};

// ============================================================================
// Severity Descriptions
// ============================================================================

const SEVERITY_DESCRIPTIONS: Record<ConfirmationRequest["severity"], string> = {
  low: "This is a minor operation",
  medium: "This action may have side effects",
  high: "This action cannot be easily undone",
  critical: "This is a destructive action!",
};

// ============================================================================
// Confirmation Manager
// ============================================================================

export type ConfirmationHandler = (
  request: ConfirmationRequest
) => Promise<ConfirmationResponse>;

export class ConfirmationManager {
  private config: ConfirmationConfig;
  private pendingRequests: Map<string, ConfirmationRequest> = new Map();
  private defaultHandler: ConfirmationHandler | null = null;

  constructor(config: Partial<ConfirmationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIRMATION_CONFIG, ...config };
  }

  /**
   * Set the default confirmation handler (for non-voice contexts)
   */
  setDefaultHandler(handler: ConfirmationHandler): void {
    this.defaultHandler = handler;
  }

  /**
   * Create a confirmation request
   */
  createRequest(
    actionDescription: string,
    severity: ConfirmationRequest["severity"] = "medium"
  ): ConfirmationRequest {
    const request: ConfirmationRequest = ConfirmationRequestSchema.parse({
      request_id: this.generateRequestId(),
      action_description: actionDescription,
      severity,
      requires_verbal_confirmation: true,
      timeout_ms: this.config.defaultTimeoutMs,
    });
    this.pendingRequests.set(request.request_id, request);
    return request;
  }

  /**
   * Generate a spoken confirmation prompt
   */
  generatePrompt(request: ConfirmationRequest): string {
    const severityNote = SEVERITY_DESCRIPTIONS[request.severity];
    return `Before I ${request.action_description}: ${severityNote}. Do you want me to proceed? Please say yes or no.`;
  }

  /**
   * Parse a verbal response
   */
  parseVerbalResponse(
    transcript: string
  ): { confirmed: boolean; isValid: boolean } {
    const normalized = transcript.toLowerCase().trim();

    const affirmative = ["yes", "yeah", "yep", "sure", "ok", "okay", "do it", "proceed", "go ahead", "confirm"];
    const negative = ["no", "nope", "nah", "cancel", "stop", "don't", "do not", "abort", "reject"];

    for (const phrase of affirmative) {
      if (normalized.includes(phrase)) {
        return { confirmed: true, isValid: true };
      }
    }

    for (const phrase of negative) {
      if (normalized.includes(phrase)) {
        return { confirmed: false, isValid: true };
      }
    }

    return { confirmed: false, isValid: false };
  }

  /**
   * Handle a confirmation response
   */
  async handleResponse(
    requestId: string,
    response: ConfirmationResponse
  ): Promise<{ success: boolean; request: ConfirmationRequest }> {
    const request = this.pendingRequests.get(requestId);
    if (!request) {
      return { success: false, request: ConfirmationRequestSchema.parse({}) as ConfirmationRequest };
    }

    this.pendingRequests.delete(requestId);
    return { success: true, request };
  }

  /**
   * Wait for a verbal confirmation
   */
  async waitForVerbalConfirmation(
    request: ConfirmationRequest,
    _getNextTranscript: () => Promise<string>,
    onPrompt: (prompt: string) => void
  ): Promise<ConfirmationResponse> {
    let retries = 0;

    while (retries < this.config.maxRetries) {
      // Generate and speak prompt
      const prompt = this.generatePrompt(request);
      onPrompt(prompt);

      // Wait for response
      const transcript = await this.waitForResponse(request.timeout_ms || this.config.defaultTimeoutMs);
      if (!transcript) {
        // Timeout
        return ConfirmationResponseSchema.parse({
          request_id: request.request_id,
          confirmed: false,
          response_text: "Timeout - no response received",
        });
      }

      // Parse response
      const { confirmed, isValid } = this.parseVerbalResponse(transcript);

      if (isValid) {
        return ConfirmationResponseSchema.parse({
          request_id: request.request_id,
          confirmed,
          response_text: transcript,
        });
      }

      // Invalid response, retry
      retries++;
      onPrompt(this.config.retryPrompt);
    }

    // Max retries exceeded
    return ConfirmationResponseSchema.parse({
      request_id: request.request_id,
      confirmed: false,
      response_text: "Maximum retries exceeded",
    });
  }

  /**
   * Check if a severity requires confirmation
   */
  static requiresConfirmation(severity: ConfirmationRequest["severity"]): boolean {
    return severity === "high" || severity === "critical";
  }

  /**
   * Get severity from action type
   */
  static getSeverityFromAction(action: string): ConfirmationRequest["severity"] {
    const destructive = ["delete", "drop", "remove", "terminate"];
    const highRisk = ["deploy", "restart", "stop", "kill", "cancel"];

    if (destructive.includes(action)) return "critical";
    if (highRisk.includes(action)) return "high";
    return "medium";
  }

  /**
   * Generate request ID
   */
  private generateRequestId(): string {
    return `confirm_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Wait for response with timeout
   */
  private waitForResponse(timeoutMs: number): Promise<string | null> {
    return new Promise((resolve) => {
      // In real implementation, this would integrate with the voice system
      // For now, simulate with a timeout
      setTimeout(() => resolve(null), timeoutMs);
    });
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createConfirmationManager(
  config?: Partial<ConfirmationConfig>
): ConfirmationManager {
  return new ConfirmationManager(config);
}
