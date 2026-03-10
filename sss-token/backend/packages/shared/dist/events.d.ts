/**
 * Event parsing utilities for SSS Token Backend Services
 */
import type { InstructionType } from './types';
/**
 * Parse instruction type from program log
 */
export declare function parseInstructionType(logs: string[]): InstructionType | null;
/**
 * Extract event data from instruction
 */
export declare function extractEventData(instructionType: InstructionType, data: Buffer): Record<string, unknown>;
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
export declare function createWebhookPayload(event: {
    id: number;
    signature: string;
    slot: number;
    blockTime: Date;
    instructionType: InstructionType;
    mintAddress: string;
    data: Record<string, unknown>;
}): WebhookEventPayload;
/**
 * Event type filter for webhooks
 */
export declare function matchesEventFilter(eventType: InstructionType, mintAddress: string, subscribedTypes: string[], subscribedMints: string[] | null): boolean;
//# sourceMappingURL=events.d.ts.map