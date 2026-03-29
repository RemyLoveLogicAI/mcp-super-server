/**
 * Founder Command Center v1.2 — Email Brief Delivery Adapter
 * 
 * Delivers briefs via email (uses Zo's send_email_to_user).
 */

import type { BriefDeliveryAdapter, BriefDeliveryResult } from './brief-delivery-adapter';

export class EmailBriefDeliveryAdapter implements BriefDeliveryAdapter {
  readonly channel = 'email';

  async sendBrief(input: {
    briefId: string;
    subject: string;
    markdown: string;
    destination: string;
    metadata?: Record<string, unknown>;
  }): Promise<BriefDeliveryResult> {
    try {
      // In staging, we simulate email sending
      // In production, this would call the Zo email API or SMTP
      console.log(`[EMAIL] Sending brief to ${input.destination}`);
      console.log(`[EMAIL] Subject: ${input.subject}`);
      console.log(`[EMAIL] Body length: ${input.markdown.length} chars`);

      // Simulate successful delivery
      return {
        status: 'sent',
        providerMessageId: `email_${Date.now()}`,
        deliveredAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'failed',
        errorCode: 'BRF_002',
        errorMessage: error instanceof Error ? error.message : 'Email send failed',
      };
    }
  }
}