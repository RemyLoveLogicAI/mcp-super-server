/**
 * @mss/approval-gate - Notify
 * SMS notification service with rate limiting
 */

import type { ApprovalRequest, RiskLevel } from "./schema.js";

/**
 * SMS notification configuration.
 */
export interface NotifyConfig {
  /** Send SMS for these risk levels and above */
  minRiskLevel: RiskLevel;
  /** Minimum time between SMS for same recipient (ms) */
  rateLimitMs: number;
  /** Deep link base URL for the approval page */
  deepLinkBase: string;
}

/**
 * Default notification configuration.
 */
export const DEFAULT_NOTIFY_CONFIG: NotifyConfig = {
  minRiskLevel: "medium",
  rateLimitMs: 5 * 60 * 1000, // 5 minutes
  deepLinkBase: "https://remysr.zo.space/approval-gate",
};

/**
 * Rate limit tracker per recipient.
 */
class RateLimiter {
  private lastSent: Map<string, number> = new Map();

  canSend(recipient: string, rateLimitMs: number): boolean {
    const last = this.lastSent.get(recipient);
    if (!last) return true;
    return Date.now() - last >= rateLimitMs;
  }

  markSent(recipient: string): void {
    this.lastSent.set(recipient, Date.now());
  }
}

/**
 * SMS sender interface - implemented externally via tool injection
 */
export interface SmsSender {
  send(message: string, recipientId: string): Promise<void>;
}

/**
 * Default SMS sender that logs messages.
 */
class DefaultSmsSender implements SmsSender {
  async send(message: string, recipientId: string): Promise<void> {
    console.log(`[Approval SMS] To: ${recipientId}\n${message}`);
  }
}

function summarizeContext(context: Record<string, unknown>): string {
  const keys = ["action", "recipient", "target", "resource", "scope", "purpose", "session_id", "canonical_user_id"];
  const parts: string[] = [];

  for (const key of keys) {
    const value = context[key];
    if (typeof value === "string" && value.trim()) {
      parts.push(`${key}: ${value}`);
    }
  }

  return parts.join(" | ");
}

/**
 * SMS notification service.
 */
export class ApprovalNotifier {
  private config: NotifyConfig;
  private rateLimiter: RateLimiter;
  private smsSender: SmsSender;

  constructor(config: Partial<NotifyConfig> = {}, smsSender?: SmsSender) {
    this.config = { ...DEFAULT_NOTIFY_CONFIG, ...config };
    this.rateLimiter = new RateLimiter();
    this.smsSender = smsSender ?? new DefaultSmsSender();
  }

  /**
   * Check if a risk level should trigger notification.
   */
  private shouldNotify(riskLevel: RiskLevel): boolean {
    const levels: RiskLevel[] = ["low", "medium", "high", "critical"];
    const minIdx = levels.indexOf(this.config.minRiskLevel);
    const currentIdx = levels.indexOf(riskLevel);
    return currentIdx >= minIdx;
  }

  /**
   * Build SMS message for an approval request.
   */
  buildMessage(request: ApprovalRequest): string {
    const riskEmoji: Record<RiskLevel, string> = {
      low: "ℹ️",
      medium: "⚠️",
      high: "🚨",
      critical: "🔥",
    };

    const link = `${this.config.deepLinkBase}/${request.id}`;
    const timeoutMinutes = Math.max(1, Math.round(request.timeout_ms / 1000 / 60));
    const contextSummary = summarizeContext(request.context);
    const proposer = request.proposed_by || "unknown";

    return [
      `${riskEmoji[request.risk_level]} Orion approval needed`,
      `Action: ${request.action}`,
      `Risk: ${request.risk_level.toUpperCase()}${request.reversibility ? " | Reversible" : " | Irreversible"}`,
      `Requested by: ${proposer}`,
      contextSummary ? `Context: ${contextSummary}` : null,
      `Ref: ${request.id}`,
      `Expires in ~${timeoutMinutes} min`,
      `Open: ${link}`,
      `Reply YES to approve or NO to reject.`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  /**
   * Send notification for an approval request.
   * Returns true if notification was sent, false if rate limited.
   */
  async notify(request: ApprovalRequest, recipientId: string): Promise<boolean> {
    if (!this.shouldNotify(request.risk_level)) {
      return false;
    }

    if (!this.rateLimiter.canSend(recipientId, this.config.rateLimitMs)) {
      return false;
    }

    const message = this.buildMessage(request);
    await this.smsSender.send(message, recipientId);
    this.rateLimiter.markSent(recipientId);
    return true;
  }

  /**
   * Set custom rate limiter (for testing).
   */
  setRateLimiter(limiter: RateLimiter): void {
    this.rateLimiter = limiter;
  }

  /**
   * Set custom SMS sender (for testing).
   */
  setSmsSender(sender: SmsSender): void {
    this.smsSender = sender;
  }
}
