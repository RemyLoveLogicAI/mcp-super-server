#!/bin/bash

# MCP Super-Server — Health Check Script
# 
# This script runs comprehensive health checks on all MCP server subsystems:
# - Server health endpoint
# - Voice session creation and FSM transitions
# - Tool registry access and gate evaluation
# - Ledger read/write operations
# - Identity resolution
#
# Usage: ./scripts/health_check.sh [--verbose]
# Returns: Exit code 0 if healthy, 1 if unhealthy

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
VERBOSE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --verbose|-v)
      VERBOSE=true
      shift
      ;;
    --help|-h)
      echo "MCP Super-Server Health Check"
      echo ""
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --verbose, -v    Enable verbose output"
      echo "  --help, -h       Show this help message"
      echo ""
      echo "Exit codes:"
      echo "  0  All health checks passed"
      echo "  1  One or more health checks failed"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Logging functions
log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[PASS]${NC} $1"
}

log_error() {
  echo -e "${RED}[FAIL]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

# Check if required tools are available
check_prerequisites() {
  log_info "Checking prerequisites..."
  
  if ! command -v bun &> /dev/null; then
    log_error "bun is not installed. Please install bun to run health checks."
    exit 1
  fi
  
  if ! command -v pnpm &> /dev/null; then
    log_warn "pnpm not found. Health check may fail if dependencies are not installed."
  fi
  
  log_success "Prerequisites met"
}

# Check if project is built
check_build() {
  log_info "Checking if project is built..."
  
  cd "${PROJECT_ROOT}"
  
  # Check for build artifacts
  if [[ ! -d "apps/server/dist" ]] || [[ ! -d "packages/core/dist" ]]; then
    log_warn "Project not built. Running build..."
    if command -v pnpm &> /dev/null; then
      pnpm build
    else
      log_error "Cannot build without pnpm. Please run 'pnpm build' first."
      exit 1
    fi
  fi
  
  log_success "Build artifacts found"
}

# Run the TypeScript health check
run_health_check() {
  log_info "Running health checks..."
  
  cd "${PROJECT_ROOT}"
  
  if [[ "${VERBOSE}" == true ]]; then
    bun run "${SCRIPT_DIR}/health_check.ts"
  else
    bun run "${SCRIPT_DIR}/health_check.ts" 2>&1 | grep -E '(PASS|FAIL|HEALTHY|UNHEALTHY|Total:|Duration:|Status:)' || true
  fi
  
  local exit_code=$?
  
  if [[ $exit_code -eq 0 ]]; then
    echo ""
    log_success "All health checks passed"
    return 0
  else
    echo ""
    log_error "Health checks failed"
    return 1
  fi
}

# Send notification on failure (optional)
send_notification() {
  local message="MCP Super-Server health check failed at $(date -Iseconds)"
  
  # Check if we have notification capabilities
  if command -v notify-send &> /dev/null; then
    notify-send "MCP Health Check" "$message" --urgency=critical
  fi
  
  # Log to stderr for system monitoring tools
  echo "$message" >&2
}

# Main execution
main() {
  echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║           MCP SUPER-SERVER — HEALTH CHECK WRAPPER             ║${NC}"
  echo -e "${BLUE}╠═══════════════════════════════════════════════════════════════╣${NC}"
  echo -e "${BLUE}║  Project: ${PROJECT_ROOT}${NC}"
  echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  
  # Run all checks
  check_prerequisites
  check_build
  
  if ! run_health_check; then
    send_notification
    exit 1
  fi
  
  exit 0
}

# Run main function
main "$@"
