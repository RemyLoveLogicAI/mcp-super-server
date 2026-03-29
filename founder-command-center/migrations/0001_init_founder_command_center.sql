-- Founder Command Center v1.2 — D1 Schema
-- Schema Version: 1.0.0
-- Migration: 0001_init_founder_command_center.sql

-- Signals: normalized input signals
CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_ref TEXT,
  title TEXT,
  body TEXT NOT NULL,
  priority TEXT,
  confidence REAL,
  status TEXT NOT NULL,
  signal_type TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  raw_payload_json TEXT,
  correlation_id TEXT
);

-- Decisions: classification and routing outcomes
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  signal_id TEXT NOT NULL,
  decision_type TEXT NOT NULL,
  recommended_action TEXT,
  priority TEXT NOT NULL,
  confidence REAL NOT NULL,
  requires_approval INTEGER NOT NULL,
  rationale TEXT,
  policy_version TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  correlation_id TEXT,
  FOREIGN KEY (signal_id) REFERENCES signals(id)
);

-- Approvals: approval requests and resolutions
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  signal_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  assigned_to TEXT,
  status TEXT NOT NULL,
  reason TEXT,
  resolution_note TEXT,
  resolved_by TEXT,
  resolved_at TEXT,
  policy_version TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  correlation_id TEXT,
  FOREIGN KEY (signal_id) REFERENCES signals(id),
  FOREIGN KEY (decision_id) REFERENCES decisions(id)
);

-- Actions: executable or blocked actions
CREATE TABLE IF NOT EXISTS actions (
  id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  signal_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  approval_id TEXT,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL,
  target_ref TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  last_error_message TEXT,
  result_ref TEXT,
  started_at TEXT,
  completed_at TEXT,
  policy_version TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  correlation_id TEXT,
  FOREIGN KEY (signal_id) REFERENCES signals(id),
  FOREIGN KEY (decision_id) REFERENCES decisions(id),
  FOREIGN KEY (approval_id) REFERENCES approvals(id)
);

-- Receipts: immutable audit trail
CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  signal_id TEXT,
  decision_id TEXT,
  approval_id TEXT,
  action_id TEXT,
  brief_id TEXT,
  confidence REAL,
  policy_version TEXT,
  actor TEXT NOT NULL,
  result_ref TEXT,
  error_code TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  correlation_id TEXT
);

-- Briefs: generated daily briefs
CREATE TABLE IF NOT EXISTS briefs (
  id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  brief_date TEXT NOT NULL,
  status TEXT NOT NULL,
  summary_markdown TEXT NOT NULL,
  blocked_count INTEGER NOT NULL DEFAULT 0,
  pending_approval_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  anomalies_json TEXT NOT NULL DEFAULT '[]',
  recommendations_json TEXT NOT NULL DEFAULT '[]',
  source_window_start TEXT NOT NULL,
  source_window_end TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

-- Brief Deliveries: external delivery tracking
CREATE TABLE IF NOT EXISTS brief_deliveries (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  brief_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  destination TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_message_id TEXT,
  error_code TEXT,
  error_message TEXT,
  delivered_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (brief_id) REFERENCES briefs(id)
);

-- Dead Letters: failed actions
CREATE TABLE IF NOT EXISTS dead_letters (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  source_table TEXT NOT NULL,
  source_id TEXT NOT NULL,
  error_code TEXT NOT NULL,
  error_message TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  retry_count INTEGER NOT NULL,
  policy_version TEXT,
  correlation_id TEXT
);
