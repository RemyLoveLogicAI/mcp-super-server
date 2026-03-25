/**
 * MCP Super-Server — Prometheus Metrics
 * 
 * Exposes metrics at /metrics endpoint for monitoring.
 * Follows Prometheus naming conventions.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Metric Types
// ─────────────────────────────────────────────────────────────────────────────

interface Counter {
  name: string;
  help: string;
  type: "counter";
  labels: string[];
  values: Map<string, number>;
}

interface Gauge {
  name: string;
  help: string;
  type: "gauge";
  labels: string[];
  values: Map<string, number>;
}

interface Histogram {
  name: string;
  help: string;
  type: "histogram";
  labels: string[];
  buckets: number[];
  values: Map<string, { sum: number; count: number; buckets: Map<number, number> }>;
}

type Metric = Counter | Gauge | Histogram;

// ─────────────────────────────────────────────────────────────────────────────
// Metrics Registry
// ─────────────────────────────────────────────────────────────────────────────

class MetricsRegistry {
  private metrics = new Map<string, Metric>();
  private prefix: string;

  constructor(prefix = "mss_") {
    this.prefix = prefix;
  }

  // --------------------------------------------------------------------------
  // Registration
  // --------------------------------------------------------------------------

  registerCounter(name: string, help: string, labels: string[] = []): void {
    const fullName = this.prefix + name;
    this.metrics.set(fullName, {
      name: fullName,
      help,
      type: "counter",
      labels,
      values: new Map(),
    });
  }

  registerGauge(name: string, help: string, labels: string[] = []): void {
    const fullName = this.prefix + name;
    this.metrics.set(fullName, {
      name: fullName,
      help,
      type: "gauge",
      labels,
      values: new Map(),
    });
  }

  registerHistogram(
    name: string,
    help: string,
    labels: string[] = [],
    buckets: number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
  ): void {
    const fullName = this.prefix + name;
    this.metrics.set(fullName, {
      name: fullName,
      help,
      type: "histogram",
      labels,
      buckets,
      values: new Map(),
    });
  }

  // --------------------------------------------------------------------------
  // Recording
  // --------------------------------------------------------------------------

  inc(name: string, labels: Record<string, string> = {}, value = 1): void {
    const fullName = this.prefix + name;
    const metric = this.metrics.get(fullName);
    if (!metric || metric.type !== "counter") {
      throw new Error(`Counter ${fullName} not found or wrong type`);
    }
    const key = this.labelKey(labels);
    const current = metric.values.get(key) ?? 0;
    metric.values.set(key, current + value);
  }

  dec(name: string, labels: Record<string, string> = {}, value = 1): void {
    const fullName = this.prefix + name;
    const metric = this.metrics.get(fullName);
    if (!metric || metric.type !== "gauge") {
      throw new Error(`Gauge ${fullName} not found or wrong type`);
    }
    const key = this.labelKey(labels);
    const current = metric.values.get(key) ?? 0;
    metric.values.set(key, current - value);
  }

  set(name: string, value: number, labels: Record<string, string> = {}): void {
    const fullName = this.prefix + name;
    const metric = this.metrics.get(fullName);
    if (!metric || metric.type !== "gauge") {
      throw new Error(`Gauge ${fullName} not found or wrong type`);
    }
    const key = this.labelKey(labels);
    metric.values.set(key, value);
  }

  observe(name: string, value: number, labels: Record<string, string> = {}): void {
    const fullName = this.prefix + name;
    const metric = this.metrics.get(fullName);
    if (!metric || metric.type !== "histogram") {
      throw new Error(`Histogram ${fullName} not found or wrong type`);
    }
    const key = this.labelKey(labels);
    let entry = metric.values.get(key);
    if (!entry) {
      entry = { sum: 0, count: 0, buckets: new Map(metric.buckets.map((b) => [b, 0])) };
      metric.values.set(key, entry);
    }
    entry.sum += value;
    entry.count++;
    for (const bucket of metric.buckets) {
      if (value <= bucket) {
        entry.buckets.set(bucket, (entry.buckets.get(bucket) ?? 0) + 1);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Output
  // --------------------------------------------------------------------------

  export(): string {
    const lines: string[] = [];

    for (const metric of this.metrics.values()) {
      lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} ${metric.type}`);

      if (metric.type === "counter" || metric.type === "gauge") {
        for (const [key, value] of metric.values) {
          const labels = key ? `{${key}}` : "";
          lines.push(`${metric.name}${labels} ${value}`);
        }
      } else if (metric.type === "histogram") {
        for (const [labelKey, entry] of metric.values) {
          const labels = labelKey ? `${labelKey},` : "";
          const baseLabels = labels ? `{${labels}` : "{";

          // Bucket counts
          for (const bucket of metric.buckets) {
            const le = `le="${bucket}"`;
            const fullLabels = labels ? `{${labels}${le}}` : `{${le}}`;
            lines.push(`${metric.name}_bucket${fullLabels} ${entry.buckets.get(bucket) ?? 0}`);
          }
          lines.push(`${metric.name}_bucket${baseLabels}le="+Inf"} ${entry.count}`);

          // Sum and count
          lines.push(`${metric.name}_sum${labels ? `{${labelKey}}` : ""} ${entry.sum}`);
          lines.push(`${metric.name}_count${labels ? `{${labelKey}}` : ""} ${entry.count}`);
        }
      }
    }

    return lines.join("\n") + "\n";
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private labelKey(labels: Record<string, string>): string {
    const keys = Object.keys(labels).sort();
    if (keys.length === 0) return "";
    return keys.map((k) => `${k}="${labels[k]}"`).join(",");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Default Metrics
// ─────────────────────────────────────────────────────────────────────────────

export function createMetricsRegistry(prefix = "mss_"): MetricsRegistry {
  const registry = new MetricsRegistry(prefix);

  // HTTP metrics
  registry.registerCounter("http_requests_total", "Total HTTP requests", ["method", "path", "status"]);
  registry.registerHistogram("http_request_duration_seconds", "HTTP request duration", ["method", "path"]);
  registry.registerCounter("http_response_size_bytes", "HTTP response size in bytes", ["method", "path"]);
  registry.registerCounter("http_request_size_bytes", "HTTP request size in bytes", ["method", "path"]);

  // Session metrics
  registry.registerGauge("sessions_active", "Number of active sessions");
  registry.registerCounter("sessions_created_total", "Total sessions created");
  registry.registerCounter("sessions_expired_total", "Total sessions expired due to TTL");
  registry.registerHistogram("session_duration_seconds", "Session duration before expiration");

  // Tool gate metrics
  registry.registerCounter("tool_calls_total", "Total tool invocations", ["tool_id", "decision"]);
  registry.registerCounter("tool_calls_blocked_total", "Total blocked tool calls", ["tool_id", "reason"]);
  registry.registerHistogram("tool_call_duration_seconds", "Tool invocation duration", ["tool_id"]);

  // Ledger metrics
  registry.registerCounter("ledger_events_appended_total", "Total events appended to ledger");
  registry.registerCounter("ledger_replays_total", "Total ledger replay operations");
  registry.registerHistogram("ledger_replay_duration_seconds", "Ledger replay duration");
  registry.registerGauge("ledger_event_count", "Total events in ledger");

  // Voice FSM metrics
  registry.registerCounter("voice_transitions_total", "Total voice FSM transitions", ["from_state", "to_state", "event"]);
  registry.registerCounter("voice_barge_ins_total", "Total barge-in interruptions");
  registry.registerHistogram("voice_turn_duration_seconds", "Voice turn duration");

  // Rate limiter metrics
  registry.registerCounter("rate_limit_hits_total", "Total rate limit hits", ["path"]);
  registry.registerGauge("rate_limit_remaining", "Remaining requests in current window", ["client_ip"]);

  return registry;
}

// ─────────────────────────────────────────────────────────────────────────────
// Timing Helper
// ─────────────────────────────────────────────────────────────────────────────

export class Timer {
  private start: number;

  constructor() {
    this.start = performance.now();
  }

  elapsed(): number {
    return (performance.now() - this.start) / 1000; // seconds
  }
}

export type { MetricsRegistry };