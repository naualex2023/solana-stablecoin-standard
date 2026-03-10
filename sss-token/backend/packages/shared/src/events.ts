/**
 * Event parsing utilities for SSS Token Backend Services
 */

import type { InstructionType } from './types';

/**
 * Parse instruction type from program log
 */
export function parseInstructionType(logs: string[]): InstructionType | null {
  for (const log of logs) {
    // Look for program log instruction discriminator
    if (log.includes('Program log: Instruction:')) {
      const match = log.match(/Instruction:\s*(\w+)/);
      if (match) {
        return match[1] as InstructionType;
      }
    }
  }
  return null;
}

/**
 * Extract event data from instruction
 */
export function extractEventData(
  instructionType: InstructionType,
  data: Buffer
): Record<string, unknown> {
  // This would be implemented based on the program's event structure
  // For now, return empty object - actual implementation would decode
  // the Borsh-serialized event data
  return {};
}

/**
 * Webhook event payload structure
 */
export interface WebhookEventPayload {
  id: string;
  type: InstructionType;
  signature: string;
  slot: number;
  blockTime: number;
  mintAddress: string;
  data: Record<string, unknown>;
}

/**
 * Create webhook payload from event
 */
export function createWebhookPayload(event: {
  id: number;
  signature: string;
  slot: number;
  blockTime: Date;
  instructionType: InstructionType;
  mintAddress: string;
  data: Record<string, unknown>;
}): WebhookEventPayload {
  return {
    id: event.id.toString(),
    type: event.instructionType,
    signature: event.signature,
    slot: event.slot,
    blockTime: Math.floor(event.blockTime.getTime() / 1000),
    mintAddress: event.mintAddress,
    data: event.data,
  };
}

/**
 * Event type filter for webhooks
 */
export function matchesEventFilter(
  eventType: InstructionType,
  mintAddress: string,
  subscribedTypes: string[],
  subscribedMints: string[] | null
): boolean {
  // Check if event type matches
  if (!subscribedTypes.includes(eventType) && !subscribedTypes.includes('*')) {
    return false;
  }

  // Check if mint matches (if filter is set)
  if (subscribedMints && subscribedMints.length > 0) {
    if (!subscribedMints.includes(mintAddress)) {
      return false;
    }
  }

  return true;
}
