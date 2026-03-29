-- Founder Command Center v1.2 — Indexes
-- Migration: 0002_indexes.sql

CREATE INDEX IF NOT EXISTS idx_signals_created_at ON signals(created_at);
CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);
CREATE INDEX IF NOT EXISTS idx_decisions_signal_id ON decisions(signal_id);
CREATE INDEX IF NOT EXISTS idx_decisions_priority ON decisions(priority);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
CREATE INDEX IF NOT EXISTS idx_approvals_assigned_to ON approvals(assigned_to);
CREATE INDEX IF NOT EXISTS idx_actions_status ON actions(status);
CREATE INDEX IF NOT EXISTS idx_actions_signal_id ON actions(signal_id);
CREATE INDEX IF NOT EXISTS idx_receipts_event_type ON receipts(event_type);
CREATE INDEX IF NOT EXISTS idx_receipts_correlation_id ON receipts(correlation_id);
CREATE INDEX IF NOT EXISTS idx_briefs_brief_date ON briefs(brief_date);
CREATE INDEX IF NOT EXISTS idx_brief_deliveries_brief_id ON brief_deliveries(brief_id);
CREATE INDEX IF NOT EXISTS idx_dead_letters_source_id ON dead_letters(source_id);
