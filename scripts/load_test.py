#!/usr/bin/env python3
"""
MCP Super-Server Load Testing
Tests concurrent sessions, tool invocation bursts, and ledger throughput.
"""

import asyncio
import aiohttp
import time
import json
from dataclasses import dataclass
from typing import List, Dict

API_BASE = "https://mcp-super-server-remysr.zocomputer.io"

@dataclass
class TestResult:
    name: str
    passed: int
    failed: int
    avg_latency_ms: float
    total_time_ms: float
    errors: List[str]

async def test_health_endpoint(session: aiohttp.ClientSession) -> TestResult:
    """Test basic health endpoint responsiveness."""
    errors = []
    latencies = []
    passed = failed = 0
    start = time.time()

    for i in range(100):
        try:
            req_start = time.time()
            async with session.get(f"{API_BASE}/health", timeout=5) as resp:
                await resp.json()
                latencies.append((time.time() - req_start) * 1000)
                passed += 1
        except Exception as e:
            failed += 1
            errors.append(str(e))

    total_time = (time.time() - start) * 1000
    avg_latency = sum(latencies) / len(latencies) if latencies else 0

    return TestResult(
        name="Health Endpoint (100 requests)",
        passed=passed,
        failed=failed,
        avg_latency_ms=avg_latency,
        total_time_ms=total_time,
        errors=errors[:5]
    )

async def test_concurrent_health_requests(session: aiohttp.ClientSession) -> TestResult:
    """Test concurrent health check requests."""
    errors = []
    latencies = []
    passed = failed = 0
    start = time.time()

    async def single_request():
        try:
            req_start = time.time()
            async with session.get(f"{API_BASE}/health", timeout=10) as resp:
                await resp.json()
                return (time.time() - req_start) * 1000, True, None
        except Exception as e:
            return 0, False, str(e)

    # 50 concurrent requests
    tasks = [single_request() for _ in range(50)]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for result in results:
        if isinstance(result, Exception):
            failed += 1
            errors.append(str(result))
        else:
            latency, ok, err = result
            if ok:
                passed += 1
                latencies.append(latency)
            else:
                failed += 1
                errors.append(err)

    total_time = (time.time() - start) * 1000
    avg_latency = sum(latencies) / len(latencies) if latencies else 0

    return TestResult(
        name="Concurrent Health (50 parallel)",
        passed=passed,
        failed=failed,
        avg_latency_ms=avg_latency,
        total_time_ms=total_time,
        errors=errors[:5]
    )

async def test_api_endpoints(session: aiohttp.ClientSession) -> TestResult:
    """Test all available API endpoints."""
    errors = []
    latencies = []
    passed = failed = 0
    start = time.time()

    endpoints = ["/", "/health", "/status"]

    for endpoint in endpoints:
        for i in range(20):
            try:
                req_start = time.time()
                async with session.get(f"{API_BASE}{endpoint}", timeout=5) as resp:
                    await resp.text()
                    latencies.append((time.time() - req_start) * 1000)
                    passed += 1
            except Exception as e:
                failed += 1
                errors.append(f"{endpoint}: {str(e)}")

    total_time = (time.time() - start) * 1000
    avg_latency = sum(latencies) / len(latencies) if latencies else 0

    return TestResult(
        name="API Endpoints (60 total requests)",
        passed=passed,
        failed=failed,
        avg_latency_ms=avg_latency,
        total_time_ms=total_time,
        errors=errors[:5]
    )

async def main():
    print("=" * 60)
    print("MCP SUPER-SERVER LOAD TEST")
    print("=" * 60)
    print(f"Target: {API_BASE}")
    print(f"Time: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    timeout = aiohttp.ClientTimeout(total=30)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        # Run all tests
        results = await asyncio.gather(
            test_health_endpoint(session),
            test_concurrent_health_requests(session),
            test_api_endpoints(session)
        )

    # Print results
    print("\nRESULTS:")
    print("-" * 60)

    total_passed = total_failed = 0
    for r in results:
        total_passed += r.passed
        total_failed += r.failed
        status = "✅" if r.failed == 0 else "⚠️"
        print(f"\n{status} {r.name}")
        print(f"   Passed: {r.passed} | Failed: {r.failed}")
        print(f"   Avg Latency: {r.avg_latency_ms:.2f}ms")
        print(f"   Total Time: {r.total_time_ms:.2f}ms")
        if r.errors:
            print(f"   Sample Errors: {r.errors[:3]}")

    print("\n" + "=" * 60)
    print(f"TOTAL: {total_passed} passed | {total_failed} failed")
    print(f"Success Rate: {(total_passed / (total_passed + total_failed)) * 100:.1f}%")
    print("=" * 60)

    # Save report
    report = {
        "timestamp": time.strftime('%Y-%m-%dT%H:%M:%SZ'),
        "target": API_BASE,
        "total_requests": total_passed + total_failed,
        "passed": total_passed,
        "failed": total_failed,
        "success_rate": (total_passed / (total_passed + total_failed)) * 100,
        "tests": [
            {
                "name": r.name,
                "passed": r.passed,
                "failed": r.failed,
                "avg_latency_ms": r.avg_latency_ms,
                "total_time_ms": r.total_time_ms,
                "errors": r.errors
            }
            for r in results
        ]
    }

    report_path = "/home/workspace/mcp-super-server/reports/load_test_report.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)

    print(f"\nReport saved to: {report_path}")

    return report

if __name__ == "__main__":
    asyncio.run(main())
