-- MCP Super-Server Event Ledger Schema
-- Whitepaper §4.2.8: Event Ledger
-- 
-- This schema supports:
-- - Append-only event storage
-- - Hash chain integrity verification
-- - Timeline branching (forks)
-- - Efficient replay queries

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────────────────────
-- Events Table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS events (
  -- Primary key
  id BIGSERIAL PRIMARY KEY,
  
  -- Event identification
  event_id UUID NOT NULL DEFAULT uuid_generate_v4(),
  
  -- Event data
  event_type VARCHAR(255) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor JSONB NOT NULL DEFAULT '{}',
  payload JSONB NOT NULL DEFAULT '{}',
  
  -- Integrity chain
  hash VARCHAR(64) NOT NULL,
  prev_hash VARCHAR(64),
  
  -- World/Timeline context
  world_id UUID,
  timeline_id UUID,
  
  -- Index within timeline (for replay ordering)
  timeline_index BIGINT NOT NULL DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT events_hash_valid CHECK (length(hash) = 64),
  CONSTRAINT events_event_type_not_empty CHECK (length(event_type) > 0)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes for efficient queries
-- ─────────────────────────────────────────────────────────────────────────────

-- Event lookup by ID
CREATE INDEX IF NOT EXISTS idx_events_event_id ON events(event_id);

-- Replay queries by world/timeline
CREATE INDEX IF NOT EXISTS idx_events_world_timeline ON events(world_id, timeline_id, timeline_index);

-- Filter by event type
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);

-- Filter by actor
CREATE INDEX IF NOT EXISTS idx_events_actor ON events USING GIN(actor);

-- Timeline head queries
CREATE INDEX IF NOT EXISTS idx_events_timeline_head ON events(world_id, timeline_id, timeline_index DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Timelines Table (for tracking fork metadata)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS timelines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  world_id UUID NOT NULL,
  forked_from_timeline_id UUID,
  fork_point_index BIGINT,
  name VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT fk_timeline_world FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Worlds Table (optional, for multi-tenant isolation)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS worlds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Functions
-- ─────────────────────────────────────────────────────────────────────────────

-- Get the next timeline index for a world/timeline
CREATE OR REPLACE FUNCTION get_next_timeline_index(
  p_world_id UUID,
  p_timeline_id UUID
) RETURNS BIGINT AS $$
DECLARE
  v_max_index BIGINT;
BEGIN
  SELECT COALESCE(MAX(timeline_index), -1) INTO v_max_index
  FROM events
  WHERE world_id IS NOT DISTINCT FROM p_world_id
    AND timeline_id IS NOT DISTINCT FROM p_timeline_id;
  
  RETURN v_max_index + 1;
END;
$$ LANGUAGE plpgsql;

-- Get the latest hash for a world/timeline
CREATE OR REPLACE FUNCTION get_latest_hash(
  p_world_id UUID,
  p_timeline_id UUID
) RETURNS VARCHAR(64) AS $$
DECLARE
  v_hash VARCHAR(64);
BEGIN
  SELECT hash INTO v_hash
  FROM events
  WHERE world_id IS NOT DISTINCT FROM p_world_id
    AND timeline_id IS NOT DISTINCT FROM p_timeline_id
  ORDER BY timeline_index DESC
  LIMIT 1;
  
  RETURN v_hash;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security (optional, for multi-tenant)
-- ─────────────────────────────────────────────────────────────────────────────

-- ALTER TABLE events ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE timelines ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE worlds ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- Grants (adjust as needed for your Supabase setup)
-- ─────────────────────────────────────────────────────────────────────────────

-- GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
-- GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO authenticated;
-- GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;