#!/usr/bin/env bun
/**
 * MCP Super-Server Load Test
 * 
 * Usage:
 *   bun run scripts/load-test.ts [options]
 * 
 * Options:
 *   --duration <seconds>  Test duration (default: 60)
 *   --rate <rps>         Requests per second (default: 10)
 *   --endpoint <path>    Endpoint to test (default: /health)
 *   --concurrency <n>    Concurrent connections (default: 10)
 */

interface LoadTestConfig {
  duration: number;
  rate: number;
  endpoint: string;
  concurrency: number;
  baseUrl: string;
}

interface RequestResult {
  success: boolean;
  duration: number;
  statusCode: number;
  error?: string;
}

const DEFAULT_CONFIG: LoadTestConfig = {
  duration: 60,
  rate: 10,
  endpoint: "/health",
  concurrency: 10,
  baseUrl: "http://localhost:3000",
};

function parseArgs(): LoadTestConfig {
  const args = process.argv.slice(2);
  const config = { ...DEFAULT_CONFIG };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--duration":
        config.duration = parseInt(args[++i], 10);
        break;
      case "--rate":
        config.rate = parseInt(args[++i], 10);
        break;
      case "--endpoint":
        config.endpoint = args[++i];
        break;
      case "--concurrency":
        config.concurrency = parseInt(args[++i], 10);
        break;
      case "--url":
        config.baseUrl = args[++i];
        break;
    }
  }

  return config;
}

async function makeRequest(
  url: string,
  method: string = "GET",
  body?: unknown
): Promise<RequestResult> {
  const start = Date.now();

  try {
    const response = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    return {
      success: response.ok,
      duration: Date.now() - start,
      statusCode: response.status,
    };
  } catch (error) {
    return {
      success: false,
      duration: Date.now() - start,
      statusCode: 0,
      error: String(error),
    };
  }
}

async function runLoadTest(config: LoadTestConfig): Promise<void> {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           MCP Super-Server Load Test                          ║
╠═══════════════════════════════════════════════════════════════╣
║  Duration:     ${config.duration}s${" ".repeat(46)}║
║  Rate:         ${config.rate} req/s${" ".repeat(46)}║
║  Endpoint:     ${config.endpoint}${" ".repeat(50 - config.endpoint.length)}║
║  Concurrency:  ${config.concurrency}${" ".repeat(49)}║
║  Base URL:     ${config.baseUrl}${" ".repeat(50 - config.baseUrl.length)}║
╚═══════════════════════════════════════════════════════════════╝
  `);

  const results: RequestResult[] = [];
  const interval = 1000 / config.rate;
  const totalRequests = config.duration * config.rate;
  let completed = 0;

  const startTime = Date.now();

  console.log("Starting load test...\n");

  // Queue requests at the specified rate
  const requestQueue: Promise<RequestResult>[] = [];

  for (let i = 0; i < totalRequests; i++) {
    const url = `${config.baseUrl}${config.endpoint}`;
    
    // Create POST requests for session endpoints
    const isSessionEndpoint = config.endpoint.includes("/session");
    const body = isSessionEndpoint 
      ? { platform: "load-test", platformId: `user-${i}` }
      : undefined;
    
    requestQueue.push(
      new Promise((resolve) => {
        setTimeout(
          () => resolve(makeRequest(url, isSessionEndpoint ? "POST" : "GET", body)),
          i * interval
        );
      })
    );
  }

  // Process results
  for (const promise of requestQueue) {
    const result = await promise;
    results.push(result);
    completed++;

    // Progress indicator
    if (completed % 10 === 0 || completed === totalRequests) {
      const progress = Math.round((completed / totalRequests) * 100);
      const successRate = results.filter((r) => r.success).length / results.length;
      const avgDuration =
        results.reduce((sum, r) => sum + r.duration, 0) / results.length;

      process.stdout.write(
        `\rProgress: ${progress}% | Requests: ${completed}/${totalRequests} | Success: ${(successRate * 100).toFixed(1)}% | Avg: ${avgDuration.toFixed(0)}ms`
      );
    }
  }

  const totalDuration = (Date.now() - startTime) / 1000;

  // Calculate statistics
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const durations = results.map((r) => r.duration);

  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
  const minDuration = Math.min(...durations);
  const maxDuration = Math.max(...durations);

  // Calculate percentiles
  const sorted = [...durations].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p90 = sorted[Math.floor(sorted.length * 0.9)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];

  // Error analysis
  const errorsByCode = new Map<number, number>();
  for (const r of failed) {
    errorsByCode.set(r.statusCode, (errorsByCode.get(r.statusCode) || 0) + 1);
  }

  console.log(`\n
╔═══════════════════════════════════════════════════════════════╗
║           Load Test Results                                   ║
╠═══════════════════════════════════════════════════════════════╣
║  Total Requests:      ${totalRequests}${" ".repeat(35)}║
║  Successful:          ${successful.length} (${((successful.length / totalRequests) * 100).toFixed(1)}%)${" ".repeat(24)}║
║  Failed:              ${failed.length} (${((failed.length / totalRequests) * 100).toFixed(1)}%)${" ".repeat(29)}║
║  Total Duration:      ${totalDuration.toFixed(2)}s${" ".repeat(41)}║
║  Actual RPS:          ${(totalRequests / totalDuration).toFixed(1)}${" ".repeat(43)}║
╠═══════════════════════════════════════════════════════════════╣
║  Latency (ms):                                                ║
║    Min:                ${minDuration}${" ".repeat(45)}║
║    Avg:                ${avgDuration.toFixed(0)}${" ".repeat(45)}║
║    Max:                ${maxDuration}${" ".repeat(45)}║
║    P50:                ${p50}${" ".repeat(45)}║
║    P90:                ${p90}${" ".repeat(45)}║
║    P99:                ${p99}${" ".repeat(45)}║
╠═══════════════════════════════════════════════════════════════╣
║  Errors by Status Code:                                       ║
${Array.from(errorsByCode.entries())
  .map(([code, count]) => `║    ${code || "Network Error"}: ${count}${" ".repeat(50 - String(code || "Network Error").length - String(count).length)}║`)
  .join("\n") || "║    No errors                                                 ║"}
╚═══════════════════════════════════════════════════════════════╝
  `);

  // Save results to file
  const reportPath = `/home/workspace/mcp-super-server/logs/load-test-${Date.now()}.json`;
  const report = {
    timestamp: new Date().toISOString(),
    config,
    summary: {
      totalRequests,
      successful: successful.length,
      failed: failed.length,
      totalDuration,
      actualRps: totalRequests / totalDuration,
    },
    latency: {
      min: minDuration,
      avg: avgDuration,
      max: maxDuration,
      p50,
      p90,
      p99,
    },
    errors: Object.fromEntries(errorsByCode),
  };

  await Bun.write(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport saved to: ${reportPath}`);

  // Exit with error if failure rate > 1%
  if (failed.length / totalRequests > 0.01) {
    console.error("\n❌ Load test failed: Error rate exceeds 1%");
    process.exit(1);
  }

  console.log("\n✅ Load test passed");
}

// Run the load test
const config = parseArgs();
runLoadTest(config).catch((error) => {
  console.error("Load test failed:", error);
  process.exit(1);
});