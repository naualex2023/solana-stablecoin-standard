"use strict";
/**
 * Shared type definitions for SSS Token Backend Services
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookDeliveryStatusSchema = exports.CreateWebhookSubscriptionSchema = exports.OFACEntityTypeSchema = exports.AddToBlacklistSchema = exports.BlacklistSourceSchema = exports.CreateBurnRequestSchema = exports.CreateMintRequestSchema = exports.RequestStatusSchema = exports.RequestTypeSchema = exports.InstructionTypeSchema = void 0;
const zod_1 = require("zod");
// ============================================
// Event Types
// ============================================
exports.InstructionTypeSchema = zod_1.z.enum([
    'initialize',
    'mint_tokens',
    'burn_tokens',
    'freeze_token_account',
    'thaw_token_account',
    'pause',
    'unpause',
    'add_minter',
    'remove_minter',
    'update_minter_quota',
    'add_to_blacklist',
    'remove_from_blacklist',
    'seize',
    'update_roles',
    'transfer_authority',
]);
// ============================================
// Mint/Burn Request Types
// ============================================
exports.RequestTypeSchema = zod_1.z.enum(['mint', 'burn']);
exports.RequestStatusSchema = zod_1.z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']);
exports.CreateMintRequestSchema = zod_1.z.object({
    mintAddress: zod_1.z.string().min(32).max(44),
    amount: zod_1.z.string().regex(/^\d+$/),
    recipient: zod_1.z.string().min(32).max(44),
    idempotencyKey: zod_1.z.string().max(64).optional(),
    metadata: zod_1.z.record(zod_1.z.unknown()).optional(),
});
exports.CreateBurnRequestSchema = zod_1.z.object({
    mintAddress: zod_1.z.string().min(32).max(44),
    amount: zod_1.z.string().regex(/^\d+$/),
    idempotencyKey: zod_1.z.string().max(64).optional(),
    metadata: zod_1.z.record(zod_1.z.unknown()).optional(),
});
// ============================================
// Blacklist Types
// ============================================
exports.BlacklistSourceSchema = zod_1.z.enum(['manual', 'ofac', 'system']);
exports.AddToBlacklistSchema = zod_1.z.object({
    address: zod_1.z.string().min(32).max(44),
    reason: zod_1.z.string().min(1).max(500),
    syncOnChain: zod_1.z.boolean().optional().default(false),
});
// ============================================
// OFAC Sanctions Types
// ============================================
exports.OFACEntityTypeSchema = zod_1.z.enum(['individual', 'entity', 'vessel', 'aircraft']);
exports.CreateWebhookSubscriptionSchema = zod_1.z.object({
    name: zod_1.z.string().max(100).optional(),
    url: zod_1.z.string().url().max(500),
    eventTypes: zod_1.z.array(zod_1.z.string()).min(1),
    mintAddresses: zod_1.z.array(zod_1.z.string()).optional(),
    headers: zod_1.z.record(zod_1.z.string()).optional(),
});
exports.WebhookDeliveryStatusSchema = zod_1.z.enum(['pending', 'sent', 'failed', 'retrying']);
//# sourceMappingURL=types.js.map