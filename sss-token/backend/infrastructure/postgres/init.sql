-- ============================================
-- SSS Token Backend Database Schema
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- Events Table (Indexer)
-- ============================================
CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    signature VARCHAR(128) UNIQUE NOT NULL,
    slot BIGINT NOT NULL,
    block_time TIMESTAMP WITH TIME ZONE NOT NULL,
    instruction_type VARCHAR(100) NOT NULL,
    mint_address VARCHAR(64) NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for events table
CREATE INDEX IF NOT EXISTS idx_events_mint ON events(mint_address);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(instruction_type);
CREATE INDEX IF NOT EXISTS idx_events_slot ON events(slot);
CREATE INDEX IF NOT EXISTS idx_events_block_time ON events(block_time);
CREATE INDEX IF NOT EXISTS idx_events_signature ON events(signature);

-- ============================================
-- Mint/Burn Requests Table
-- ============================================
CREATE TABLE IF NOT EXISTS mint_burn_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(10) NOT NULL CHECK (type IN ('mint', 'burn')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    mint_address VARCHAR(44) NOT NULL,
    amount BIGINT NOT NULL,
    recipient VARCHAR(44),
    idempotency_key VARCHAR(64) UNIQUE,
    tx_signature VARCHAR(88),
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for mint_burn_requests table
CREATE INDEX IF NOT EXISTS idx_mbr_type ON mint_burn_requests(type);
CREATE INDEX IF NOT EXISTS idx_mbr_status ON mint_burn_requests(status);
CREATE INDEX IF NOT EXISTS idx_mbr_mint ON mint_burn_requests(mint_address);
CREATE INDEX IF NOT EXISTS idx_mbr_recipient ON mint_burn_requests(recipient);
CREATE INDEX IF NOT EXISTS idx_mbr_idempotency ON mint_burn_requests(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_mbr_created ON mint_burn_requests(created_at);

-- ============================================
-- Blacklist Table (Compliance)
-- ============================================
CREATE TABLE IF NOT EXISTS blacklist (
    id SERIAL PRIMARY KEY,
    address VARCHAR(44) UNIQUE NOT NULL,
    reason TEXT NOT NULL,
    source VARCHAR(50) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ofac', 'system')),
    tx_signature VARCHAR(88),
    on_chain BOOLEAN DEFAULT FALSE,
    added_by VARCHAR(44),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for blacklist table
CREATE INDEX IF NOT EXISTS idx_blacklist_address ON blacklist(address);
CREATE INDEX IF NOT EXISTS idx_blacklist_source ON blacklist(source);
CREATE INDEX IF NOT EXISTS idx_blacklist_on_chain ON blacklist(on_chain);

-- ============================================
-- OFAC Sanctions Cache Table
-- ============================================
CREATE TABLE IF NOT EXISTS ofac_sanctions (
    id SERIAL PRIMARY KEY,
    entity_id VARCHAR(50) UNIQUE NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('individual', 'entity', 'vessel', 'aircraft')),
    name TEXT NOT NULL,
    program VARCHAR(100),
    country VARCHAR(100),
    addresses JSONB,
    aliases JSONB,
    raw_data JSONB,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for ofac_sanctions table
CREATE INDEX IF NOT EXISTS idx_ofac_entity_id ON ofac_sanctions(entity_id);
CREATE INDEX IF NOT EXISTS idx_ofac_name ON ofac_sanctions USING gin(to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_ofac_type ON ofac_sanctions(type);
CREATE INDEX IF NOT EXISTS idx_ofac_country ON ofac_sanctions(country);

-- ============================================
-- Sanctions Sync Status
-- ============================================
CREATE TABLE IF NOT EXISTS sanctions_sync_status (
    id SERIAL PRIMARY KEY,
    source VARCHAR(50) NOT NULL DEFAULT 'ofac',
    last_sync_at TIMESTAMP WITH TIME ZONE,
    last_sync_count INTEGER,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    error_message TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert initial sync status
INSERT INTO sanctions_sync_status (source, status) VALUES ('ofac', 'pending') ON CONFLICT DO NOTHING;

-- ============================================
-- Webhook Subscriptions Table
-- ============================================
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100),
    url VARCHAR(500) NOT NULL,
    secret VARCHAR(64) NOT NULL,
    event_types TEXT[] NOT NULL,
    mint_addresses TEXT[],
    active BOOLEAN DEFAULT TRUE,
    headers JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for webhook_subscriptions table
CREATE INDEX IF NOT EXISTS idx_ws_active ON webhook_subscriptions(active);
CREATE INDEX IF NOT EXISTS idx_ws_event_types ON webhook_subscriptions USING gin(event_types);

-- ============================================
-- Webhook Deliveries Table
-- ============================================
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subscription_id UUID REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
    event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'retrying')),
    http_status INTEGER,
    request_headers JSONB,
    request_body JSONB,
    response_body TEXT,
    error_message TEXT,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 5,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for webhook_deliveries table
CREATE INDEX IF NOT EXISTS idx_wd_subscription ON webhook_deliveries(subscription_id);
CREATE INDEX IF NOT EXISTS idx_wd_event ON webhook_deliveries(event_id);
CREATE INDEX IF NOT EXISTS idx_wd_status ON webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_wd_next_retry ON webhook_deliveries(next_retry_at) WHERE status IN ('pending', 'retrying');
CREATE INDEX IF NOT EXISTS idx_wd_created ON webhook_deliveries(created_at);

-- ============================================
-- Audit Log Table
-- ============================================
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100),
    actor VARCHAR(44),
    details JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for audit_log table
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

-- ============================================
-- System Configuration Table
-- ============================================
CREATE TABLE IF NOT EXISTS system_config (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Functions
-- ============================================

-- Update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers for updated_at
CREATE TRIGGER update_mint_burn_requests_updated_at BEFORE UPDATE ON mint_burn_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_blacklist_updated_at BEFORE UPDATE ON blacklist
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webhook_subscriptions_updated_at BEFORE UPDATE ON webhook_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sanctions_sync_status_updated_at BEFORE UPDATE ON sanctions_sync_status
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Views
-- ============================================

-- Active webhook subscriptions view
CREATE OR REPLACE VIEW active_webhook_subscriptions AS
SELECT * FROM webhook_subscriptions WHERE active = TRUE;

-- Recent events view (last 24 hours)
CREATE OR REPLACE VIEW recent_events AS
SELECT * FROM events 
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- Pending webhook deliveries view
CREATE OR REPLACE VIEW pending_webhook_deliveries AS
SELECT wd.*, ws.url, ws.secret, ws.headers as subscription_headers
FROM webhook_deliveries wd
JOIN webhook_subscriptions ws ON wd.subscription_id = ws.id
WHERE wd.status IN ('pending', 'retrying')
AND wd.next_retry_at <= NOW()
ORDER BY wd.created_at ASC;

-- ============================================
-- Row Level Security (Optional - uncomment for production)
-- ============================================
-- ALTER TABLE mint_burn_requests ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE blacklist ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE webhook_subscriptions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
</task_progress>
</write_to_file>