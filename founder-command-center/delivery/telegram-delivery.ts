/**
 * Founder Command Center v1.2 — Telegram Brief Delivery Adapter
 * 
 * Delivers briefs via Telegram Bot API.
 */

import type { BriefDeliveryAdapter, BriefDeliveryResult } from './brief-delivery-adapter';

export class TelegramBriefDeliveryAdapter implements BriefDeliveryAdapter {
  readonly channel = 'telegram';
  private botToken: string;

  constructor(botToken: string) {
    this.botToken = botToken;
  }

  async sendBrief(input: {
    briefId: string;
    subject: string;
    markdown: string;
    destination: string;
    metadata?: Record<string, unknown>;
  }): Promise<BriefDeliveryResult> {
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    
    // Convert markdown to Telegram format
    const text = this.formatForTelegram(input.subject, input.markdown);
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: input.destination,
          text: text,
          parse_mode: 'Markdown',
        }),
      });

      const data = await response.json() as { ok?: boolean; result?: { message_id: number }; description?: string };

      if (data.ok && data.result) {
        return {
          status: 'sent',
          providerMessageId: String(data.result.message_id),
          deliveredAt: new Date().toISOString(),
        };
      }

      return {
        status: 'failed',
        errorCode: 'BRF_002',
        errorMessage: data.description || 'Unknown Telegram error',
      };
    } catch (error) {
      return {
        status: 'failed',
        errorCode: 'BRF_002',
        errorMessage: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  private formatForTelegram(subject: string, markdown: string): string {
    // Telegram has a 4096 char limit - truncate if needed
    const full = `*${subject}*\n\n${markdown}`;
    if (full.length <= 4000) {
      return full;
    }
    return full.substring(0, 4000) + '\n\n_...truncated_';
  }
}