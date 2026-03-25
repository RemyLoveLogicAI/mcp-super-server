#!/usr/bin/env bun
/**
 * MCP Super-Server Load Test
 * 
 * Usage:
 *   bun scripts/load-test.ts --url http://localhost:3000 --duration 30s --rps 100
 * 
 * Options:
 *   --url       Target URL (default: http://localhost:3000)
 *   --duration  Test duration (default: 30s)
 *   --rps       Requests per second (default: 100)
 *   --concurrency  Concurrent connections (default: 10)
 *   --verbose   Enable verbose output
 */

interface LoadTestConfig {
  url: string;
  duration: number; // seconds
  rps: number;
  concurrency: number;
  verbose: boolean;
}

interface LoadTestResult {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalDuration: number;
  minLatency: number;
  maxLatency: number;
  avgLatency: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  errors: Map<string, number>;
  statusCodes: Map<number, number>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Argument Parsing
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(): LoadTestConfig {
  const args = process.argv.slice(2);
  const config: LoadTestConfig = {
    url: "http://localhost:3000",
    duration: 30,
    rps: 100,
    concurrency: 10,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--url":
        config.url = args[++i];
        break;
      case "--duration":
        const durationStr = args[++i];
        config.duration = parseInt(durationStr.replace(/[^0-9]/g, ""), 10);
        break;
      case "--rps":
        config.rps = parseInt(args[++i], 10);
        break;
      case "--concurrency":
        config.concurrency = parseInt(args[++i], 10);
        break;
      case "--verbose":
      case "-v":
        config.verbose = true;
        break;
      case "--help":
      case "-h":
        console.log(`
MCP Super-Server Load Test

Usage:
  bun scripts/load-test.ts [options]

Options:
  --url <url>         Target URL (default: http://localhost:3000)
  --duration <sec>    Test duration in seconds (default: 30)
  --rps <num>         Requests per second (default: 100)
  --concurrency <n>   Concurrent connections (default: 10)
  --verbose, -v       Enable verbose output
  --help, -h          Show this help
`);
        process.exit(0);
    }
  }

  return config;
}

// ─────────────────────────────────────────────────────────────────────────────
// Request Generators
// ─────────────────────────────────────────────────────────────────────────────

const endpoints = [
  { method: "GET", path: "/health", weight: 30 },
  { method: "GET", path: "/status", weight: 20 },
  { method: "POST", path: "/voice/session", weight: 25, body: { platform: "telegram", platform_user_id: "test-user" } },
  { method: "POST", path: "/tool/invoke", weight: 15, body: { tool_id: "weather", input: { city: "San Francisco" } } },
  { method: "GET", path: "/metrics", weight: 10 },
];

function pickEndpoint(): (typeof endpoints)[number] {
  const totalWeight = endpoints.reduce((sum, e) => sum + e.weight, 0);
  let random = Math.random() * totalWeight;
  for (const endpoint of endpoints) {
    random -= endpoint.weight;
    if (random <= 0) return endpoint;
  }
  return endpoints[0]!;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Client
// ─────────────────────────────────────────────────────────────────────────────

async function makeRequest(
  baseUrl: string,
  endpoint: (typeof endpoints)[number],
  authToken?: string
): Promise<{ status: number; latency: number; error?: string }> {
  const url = `${baseUrl}${endpoint.path}`;
  const start = performance.now();

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
    };
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }

    const response = await fetch(url, {
      method: endpoint.method,
      headers,
      body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
    });

    const latency = performance.now() - start;

    // Drain response body
    await response.text();

    return { status: response.status, latency };
  } catch (err) {
    return {
      status: 0,
      latency: performance.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Statistics
// ─────────────────────────────────────────────────────────────────────────────

function calculatePercentile(sorted: number[], percentile: number): number {
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)]!;
}

function formatNumber(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}

function printResult(result: LoadTestResult): void {
  console.log("\n" + "=".repeat(60));
  console.log("Load Test Results");
  console.log("=".repeat(60));

  console.log("\n📊 Summary:");
  console.log(`   Total Requests:     ${result.totalRequests}`);
  console.log(`   Successful (2xx):   ${result.successfulRequests}`);
  console.log(`   Failed:             ${result.failedRequests}`);
  console.log(`   Success Rate:       ${formatNumber((result.successfulRequests / result.totalRequests) * 100, 1)}%`);

  console.log("\n⏱️  Latency (ms):");
  console.log(`   Min:                ${formatNumber(result.minLatency)}`);
  console.log(`   Max:                ${formatNumber(result.maxLatency)}`);
  console.log(`   Avg:                ${formatNumber(result.avgLatency)}`);
  console.log(`   p50:                ${formatNumber(result.p50Latency)}`);
  console.log(`   p95:                ${formatNumber(result.p95Latency)}`);
  console.log(`   p99:                ${formatNumber(result.p99Latency)}`);

  console.log("\n📡 Status Codes:");
  for (const [status, count] of result.statusCodes) {
    const label = status === 0 ? "Network Error" : `HTTP ${status}`;
    console.log(`   ${label.padEnd(15)} ${count}`);
  }

  if (result.errors.size > 0) {
    console.log("\n❌ Errors:");
    for (const [error, count] of result.errors) {
      console.log(`   ${error.slice(0, 50).padEnd(50)} ${count}`);
    }
  }

  console.log("\n📈 Throughput:");
  const rps = result.totalRequests / result.totalDuration;
  console.log(`   Requests/sec:       ${formatNumber(rps, 1)}`);

  console.log("\n" + "=".repeat(60));
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Load Test
// ─────────────────────────────────────────────────────────────────────────────

async function runLoadTest(config: LoadTestConfig): Promise<LoadTestResult> {
  const latencies: number[] = [];
  const statusCodes = new Map<number, number>();
  const errors = new Map<string, number>();
  let totalRequests = 0;
  let successfulRequests = 0;
  let failedRequests = 0;

  const startTime = performance.now();
  const endTime = startTime + config.duration * 1000;
  const interval = 1000 / config.rps;

  // Create worker queue
  const requestQueue: Array<() => Promise<void>> = [];
  let runningWorkers = 0;
  let resolveDone: () => void;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  // Worker function
  async function worker() {
    runningWorkers++;
    while (requestQueue.length > 0 || performance.now() < endTime) {
      const task = requestQueue.shift();
      if (task) {
        await task();
      } else {
        await new Promise((r) => setTimeout(r, 10));
      }
    }
    runningWorkers--;
    if (runningWorkers === 0) {
      resolveDone();
    }
  }

  // Start workers
  for (let i = 0; i < config.concurrency; i++) {
    worker();
  }

  // Schedule requests
  const requestScheduler = setInterval(() => {
    if (performance.now() >= endTime) {
      clearInterval(requestScheduler);
      return;
    }

    requestQueue.push(async () => {
      const endpoint = pickEndpoint();
      const result = await makeRequest(config.url, endpoint, process.env.MCP_AUTH_TOKEN);

      totalRequests++;
      latencies.push(result.latency);

      if (result.status >= 200 && result.status < 300) {
        successfulRequests++;
      } else {
        failedRequests++;
      }

      statusCodes.set(result.status, (statusCodes.get(result.status) ?? 0) + 1);

      if (result.error) {
        errors.set(result.error, (errors.get(result.error) ?? 0) + 1);
      }

      if (config.verbose && totalRequests % 100 === 0) {
        console.log(`Progress: ${totalRequests} requests, ${successfulRequests} success, ${failedRequests} failed`);
      }
    });
  }, interval);

  // Wait for completion
  await done;

  // Calculate statistics
  latencies.sort((a, b) => a - b);
  const totalDuration = (performance.now() - startTime) / 1000;

  return {
    totalRequests,
    successfulRequests,
    failedRequests,
    totalDuration,
    minLatency: latencies[0] ?? 0,
    maxLatency: latencies[latencies.length - 1] ?? 0,
    avgLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
    p50Latency: calculatePercentile(latencies, 50),
    p95Latency: calculatePercentile(latencies, 95),
    p99Latency: calculatePercentile(latencies, 99),
    errors,
    statusCodes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry Point
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const config = parseArgs();

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           MCP Super-Server Load Test                         ║
╠══════════════════════════════════════════════════════════════╣
║  Target:      ${config.url.padEnd(45)} ║
║  Duration:    ${String(config.duration + "s").padEnd(45)} ║
║  RPS:         ${String(config.rps).padEnd(45)} ║
║  Concurrency: ${String(config.concurrency).padEnd(45)} ║
╚══════════════════════════════════════════════════════════════╝
`);

  console.log("Starting load test...");
  const result = await runLoadTest(config);
  printResult(result);
}

main().catch((err) => {
  console.error("Load test failed:", err);
  process.exit(1);
});