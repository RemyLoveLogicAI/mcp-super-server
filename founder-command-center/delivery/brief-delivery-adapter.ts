/**
 * Founder Command Center v1.2 — Brief Delivery Adapter Interface
 * 
 * Pluggable outbound brief delivery layer.
 */

export interface BriefDeliveryResult {
  status: 'sent' | 'failed';
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
  deliveredAt?: string;
}

export interface BriefDeliveryAdapter {
  readonly channel: string;
  sendBrief(input: {
    briefId: string;
    subject: string;
    markdown: string;
    destination: string;
    metadata?: Record<string, unknown>;
  }): Promise<BriefDeliveryResult>;
}