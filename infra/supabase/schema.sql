-- MCP Super-Server Event Ledger Schema
-- Whitepaper §4.2.8: Event Ledger
-- 
-- This schema implements an append-only event store with:
-- - Hash chain for integrity
-- - Timeline support for branching
-- - Efficient replay queries

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Core Events Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS events (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Event metadata
    event_type TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Actor information
    actor_canonical_user_id UUID,
    actor_agent_id TEXT,
    actor_platform TEXT,
    actor_system BOOLEAN DEFAULT FALSE,
    
    -- World/Timeline scope (nullable for non-world events)
    world_id UUID,
    timeline_id UUID,
    
    -- Sequence number within timeline (for ordering)
    event_index BIGINT,
    
    -- Hash chain
    prev_hash TEXT,
    hash TEXT NOT NULL,
    
    -- Event payload (JSONB for flexibility + indexing)
    payload JSONB NOT NULL,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for replay queries (most common access pattern)
CREATE INDEX IF NOT EXISTS idx_events_timeline_replay 
    ON events (world_id, timeline_id, event_index ASC)
    WHERE world_id IS NOT NULL;

-- Index for event type filtering
CREATE INDEX IF NOT EXISTS idx_events_type 
    ON events (event_type);

-- Index for actor queries
CREATE INDEX IF NOT EXISTS idx_events_actor 
    ON events (actor_canonical_user_id)
    WHERE actor_canonical_user_id IS NOT NULL;

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_events_timestamp 
    ON events (timestamp DESC);

-- ============================================================================
-- Timelines Table (for branching support)
-- ============================================================================

CREATE TABLE IF NOT EXISTS timelines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    world_id UUID NOT NULL,
    name TEXT,
    
    -- Fork metadata
    forked_from_timeline_id UUID REFERENCES timelines(id),
    fork_point_event_index BIGINT,
    
    -- Current state
    head_event_index BIGINT NOT NULL DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timelines_world 
    ON timelines (world_id);

-- ============================================================================
-- Worlds Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS worlds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT,
    ruleset_version TEXT,
    
    -- Default timeline
    default_timeline_id UUID REFERENCES timelines(id),
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Voice Sessions Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS voice_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canonical_user_id UUID NOT NULL,
    channel TEXT NOT NULL,
    
    -- Current turn state
    turn_id INTEGER NOT NULL DEFAULT 0,
    asr_partial TEXT,
    asr_final TEXT,
    intent JSONB,
    
    -- Interrupt state
    interrupt_flag BOOLEAN NOT NULL DEFAULT FALSE,
    tts_stream_state TEXT NOT NULL DEFAULT 'idle' 
        CHECK (tts_stream_state IN ('idle', 'playing', 'paused', 'canceled')),
    
    -- References
    embeddings_ref TEXT,
    
    -- Tool call budget
    tool_call_budget_max_calls INTEGER NOT NULL DEFAULT 10,
    tool_call_budget_remaining_calls INTEGER NOT NULL DEFAULT 10,
    tool_call_budget_max_cost_units NUMERIC,
    tool_call_budget_remaining_cost_units NUMERIC,
    
    -- Metadata
    metadata JSONB,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Soft delete
    ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_voice_sessions_user 
    ON voice_sessions (canonical_user_id);

CREATE INDEX IF NOT EXISTS idx_voice_sessions_active 
    ON voice_sessions (ended_at)
    WHERE ended_at IS NULL;

-- ============================================================================
-- Canonical Identities Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS canonical_identities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    display_name TEXT,
    avatar_url TEXT,
    
    -- Shared state references
    inventory_ref TEXT,
    achievements_ref TEXT,
    narrative_history_ref TEXT,
    preferences JSONB,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Linked Identities Table (many-to-one with canonical)
-- ============================================================================

CREATE TABLE IF NOT EXISTS linked_identities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canonical_user_id UUID NOT NULL REFERENCES canonical_identities(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    platform_identity_id TEXT NOT NULL,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Metadata
    linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ,
    
    -- Uniqueness constraint
    UNIQUE (platform, platform_identity_id)
);

CREATE INDEX IF NOT EXISTS idx_linked_identities_canonical 
    ON linked_identities (canonical_user_id);

CREATE INDEX IF NOT EXISTS idx_linked_identities_platform 
    ON linked_identities (platform, platform_identity_id);

-- ============================================================================
-- Tool Registry Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS tools (
    id TEXT PRIMARY KEY,
    version TEXT NOT NULL,
    name TEXT,
    description TEXT,
    
    -- Capabilities
    capabilities TEXT[] NOT NULL DEFAULT '{}',
    side_effect_class TEXT NOT NULL 
        CHECK (side_effect_class IN ('read_only', 'reversible_write', 'irreversible_write')),
    min_trust_tier TEXT 
        CHECK (min_trust_tier IS NULL OR min_trust_tier IN ('untrusted', 'semi_trusted', 'trusted')),
    
    -- Schema
    schema_hash TEXT,
    input_schema JSONB,
    
    -- SLA
    expected_latency_ms INTEGER,
    available BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Provider
    provider_server_id UUID,
    tool_type TEXT,
    publisher TEXT,
    
    -- Metadata
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tools_capabilities 
    ON tools USING GIN (capabilities);

-- ============================================================================
-- Functions
-- ============================================================================

-- Function to get next event index for a timeline
CREATE OR REPLACE FUNCTION get_next_event_index(p_world_id UUID, p_timeline_id UUID)
RETURNS BIGINT AS $$
DECLARE
    next_index BIGINT;
BEGIN
    SELECT COALESCE(MAX(event_index), -1) + 1 INTO next_index
    FROM events
    WHERE world_id = p_world_id AND timeline_id = p_timeline_id;
    
    RETURN next_index;
END;
$$ LANGUAGE plpgsql;

-- Function to update timeline head after event append
CREATE OR REPLACE FUNCTION update_timeline_head()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.world_id IS NOT NULL AND NEW.timeline_id IS NOT NULL THEN
        UPDATE timelines
        SET head_event_index = NEW.event_index,
            updated_at = NOW()
        WHERE id = NEW.timeline_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_timeline_head
    AFTER INSERT ON events
    FOR EACH ROW
    EXECUTE FUNCTION update_timeline_head();

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE timelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE worlds ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE linked_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE tools ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (for server-side access)
CREATE POLICY service_all ON events FOR ALL TO service_role USING (true);
CREATE POLICY service_all ON timelines FOR ALL TO service_role USING (true);
CREATE POLICY service_all ON worlds FOR ALL TO service_role USING (true);
CREATE POLICY service_all ON voice_sessions FOR ALL TO service_role USING (true);
CREATE POLICY service_all ON canonical_identities FOR ALL TO service_role USING (true);
CREATE POLICY service_all ON linked_identities FOR ALL TO service_role USING (true);
CREATE POLICY service_all ON tools FOR ALL TO service_role USING (true);
