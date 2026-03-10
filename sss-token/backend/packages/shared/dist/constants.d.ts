/**
 * Shared constants for SSS Token Backend Services
 */
export declare const SSS_TOKEN_PROGRAM_ID: string;
export declare const REDIS_CHANNELS: {
    readonly EVENTS: "sss:events";
    readonly MINT_REQUESTS: "sss:mint_requests";
    readonly BURN_REQUESTS: "sss:burn_requests";
    readonly BLACKLIST_UPDATES: "sss:blacklist_updates";
    readonly WEBHOOK_DELIVERIES: "sss:webhook_deliveries";
};
export declare const REDIS_KEYS: {
    readonly MINT_REQUEST: "sss:mint_request";
    readonly BURN_REQUEST: "sss:burn_request";
    readonly BLACKLIST_CACHE: "sss:blacklist:cache";
    readonly SANCTIONS_CACHE: "sss:sanctions:cache";
    readonly PROCESSED_SIGNATURE: "sss:processed_sig";
    readonly SERVICE_HEALTH: "sss:health";
};
export declare const EVENT_TYPES: {
    readonly INITIALIZE: "initialize";
    readonly MINT_TOKENS: "mint_tokens";
    readonly BURN_TOKENS: "burn_tokens";
    readonly FREEZE_TOKEN_ACCOUNT: "freeze_token_account";
    readonly THAW_TOKEN_ACCOUNT: "thaw_token_account";
    readonly PAUSE: "pause";
    readonly UNPAUSE: "unpause";
    readonly ADD_MINTER: "add_minter";
    readonly REMOVE_MINTER: "remove_minter";
    readonly UPDATE_MINTER_QUOTA: "update_minter_quota";
    readonly ADD_TO_BLACKLIST: "add_to_blacklist";
    readonly REMOVE_FROM_BLACKLIST: "remove_from_blacklist";
    readonly SEIZE: "seize";
    readonly UPDATE_ROLES: "update_roles";
    readonly TRANSFER_AUTHORITY: "transfer_authority";
};
export declare const REQUEST_STATUS: {
    readonly PENDING: "pending";
    readonly PROCESSING: "processing";
    readonly COMPLETED: "completed";
    readonly FAILED: "failed";
    readonly CANCELLED: "cancelled";
};
export declare const BLACKLIST_SOURCES: {
    readonly MANUAL: "manual";
    readonly OFAC: "ofac";
    readonly SYSTEM: "system";
};
export declare const WEBHOOK_STATUS: {
    readonly PENDING: "pending";
    readonly SENT: "sent";
    readonly FAILED: "failed";
    readonly RETRYING: "retrying";
};
export declare const DEFAULTS: {
    readonly WEBHOOK_TIMEOUT_MS: 30000;
    readonly WEBHOOK_MAX_RETRIES: 5;
    readonly WEBHOOK_RETRY_BASE_DELAY_MS: 1000;
    readonly INDEXER_POLL_INTERVAL_MS: 1000;
    readonly INDEXER_MAX_SLOT_RANGE: 1000;
    readonly OFAC_SYNC_INTERVAL_MS: number;
    readonly DEFAULT_PAGE_SIZE: 20;
    readonly MAX_PAGE_SIZE: 100;
    readonly REQUEST_PROCESSING_TIMEOUT_MS: 60000;
};
export declare const HTTP_STATUS: {
    readonly OK: 200;
    readonly CREATED: 201;
    readonly NO_CONTENT: 204;
    readonly BAD_REQUEST: 400;
    readonly NOT_FOUND: 404;
    readonly CONFLICT: 409;
    readonly INTERNAL_ERROR: 500;
    readonly SERVICE_UNAVAILABLE: 503;
};
export declare const ERROR_CODES: {
    readonly INTERNAL_ERROR: "INTERNAL_ERROR";
    readonly VALIDATION_ERROR: "VALIDATION_ERROR";
    readonly NOT_FOUND: "NOT_FOUND";
    readonly REQUEST_NOT_FOUND: "REQUEST_NOT_FOUND";
    readonly REQUEST_ALREADY_PROCESSED: "REQUEST_ALREADY_PROCESSED";
    readonly DUPLICATE_IDEMPOTENCY_KEY: "DUPLICATE_IDEMPOTENCY_KEY";
    readonly MINT_FAILED: "MINT_FAILED";
    readonly BURN_FAILED: "BURN_FAILED";
    readonly ADDRESS_BLACKLISTED: "ADDRESS_BLACKLISTED";
    readonly ADDRESS_NOT_BLACKLISTED: "ADDRESS_NOT_BLACKLISTED";
    readonly SANCTIONS_MATCH: "SANCTIONS_MATCH";
    readonly SUBSCRIPTION_NOT_FOUND: "SUBSCRIPTION_NOT_FOUND";
    readonly DELIVERY_FAILED: "DELIVERY_FAILED";
    readonly INVALID_SIGNATURE: "INVALID_SIGNATURE";
    readonly TRANSACTION_FAILED: "TRANSACTION_FAILED";
    readonly INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE";
    readonly RPC_ERROR: "RPC_ERROR";
};
//# sourceMappingURL=constants.d.ts.map