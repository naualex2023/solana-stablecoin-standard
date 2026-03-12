-- ============================================
-- Migration: Fix VARCHAR column lengths
-- ============================================
-- Error code 22001 = string data right truncation
-- This happens when inserting data longer than column allows
-- 
-- Solana addresses are 32-44 chars (base58)
-- Solana signatures are 87-88 chars (base58)
-- Using generous lengths to accommodate future needs
-- ============================================

-- Fix events table - increase column lengths
ALTER TABLE events ALTER COLUMN signature TYPE VARCHAR(200);
ALTER TABLE events ALTER COLUMN instruction_type TYPE VARCHAR(100);
ALTER TABLE events ALTER COLUMN mint_address TYPE VARCHAR(100);

-- Fix mint_burn_requests table - increase to be safe
ALTER TABLE mint_burn_requests ALTER COLUMN mint_address TYPE VARCHAR(100);
ALTER TABLE mint_burn_requests ALTER COLUMN recipient TYPE VARCHAR(100);
ALTER TABLE mint_burn_requests ALTER COLUMN tx_signature TYPE VARCHAR(200);
ALTER TABLE mint_burn_requests ALTER COLUMN idempotency_key TYPE VARCHAR(128);

-- Fix blacklist table
ALTER TABLE blacklist ALTER COLUMN address TYPE VARCHAR(100);
ALTER TABLE blacklist ALTER COLUMN tx_signature TYPE VARCHAR(200);
ALTER TABLE blacklist ALTER COLUMN added_by TYPE VARCHAR(100);

-- Fix audit_log table
ALTER TABLE audit_log ALTER COLUMN entity_id TYPE VARCHAR(100);
ALTER TABLE audit_log ALTER COLUMN actor TYPE VARCHAR(100);

-- Verify changes
SELECT table_name, column_name, data_type, character_maximum_length 
FROM information_schema.columns 
WHERE table_name IN ('events', 'mint_burn_requests', 'blacklist')
AND data_type = 'character varying'
ORDER BY table_name, column_name;