"use strict";
/**
 * Event parsing utilities for SSS Token Backend Services
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseInstructionType = parseInstructionType;
exports.extractEventData = extractEventData;
exports.createWebhookPayload = createWebhookPayload;
exports.matchesEventFilter = matchesEventFilter;
/**
 * Parse instruction type from program log
 */
function parseInstructionType(logs) {
    for (const log of logs) {
        // Look for program log instruction discriminator
        if (log.includes('Program log: Instruction:')) {
            const match = log.match(/Instruction:\s*(\w+)/);
            if (match) {
                return match[1];
            }
        }
    }
    return null;
}
/**
 * Extract event data from instruction
 */
function extractEventData(instructionType, data) {
    // This would be implemented based on the program's event structure
    // For now, return empty object - actual implementation would decode
    // the Borsh-serialized event data
    return {};
}
/**
 * Create webhook payload from event
 */
function createWebhookPayload(event) {
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
function matchesEventFilter(eventType, mintAddress, subscribedTypes, subscribedMints) {
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
//# sourceMappingURL=events.js.map