#!/bin/bash

# Integration tests for @atrim/instrumentation
# Tests each example to ensure traces are sent to OTEL collector

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results
TESTS_PASSED=0
TESTS_FAILED=0
FAILED_TESTS=()

# Cleanup function
cleanup() {
  echo -e "\n${YELLOW}🧹 Cleaning up...${NC}"

  # Kill any running example servers
  pkill -f "tsx.*examples" || true
  pkill -f "node.*examples" || true

  # Stop collector
  docker-compose -f test/integration/docker-compose.yml down -v 2>/dev/null || true

  # Remove collector logs
  rm -f test/integration/collector.log
}

# Set up trap to cleanup on exit
trap cleanup EXIT INT TERM

# Start OTEL collector
start_collector() {
  echo -e "${BLUE}🚀 Starting OpenTelemetry Collector...${NC}"

  cd test/integration
  docker-compose down -v 2>/dev/null || true
  docker-compose up -d
  cd ../..

  # Wait for collector to be healthy
  echo -e "${YELLOW}⏳ Waiting for collector to be ready...${NC}"
  for i in {1..30}; do
    if docker exec atrim-otel-collector-test wget --spider -q http://localhost:13133/ 2>/dev/null; then
      echo -e "${GREEN}✅ Collector is ready${NC}"
      return 0
    fi
    sleep 1
  done

  echo -e "${RED}❌ Collector failed to start${NC}"
  exit 1
}

# Get collector logs
get_collector_logs() {
  docker logs atrim-otel-collector-test 2>&1 | tail -100
}

# Test an example
test_example() {
  local example_name=$1
  local example_dir=$2
  local test_script=$3

  echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}Testing: ${example_name}${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

  # Clear collector logs
  docker logs atrim-otel-collector-test 2>&1 | tail -0 > /dev/null

  # Run the example-specific test
  if bash "$test_script" "$example_dir"; then
    echo -e "${GREEN}✅ PASSED: ${example_name}${NC}"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}❌ FAILED: ${example_name}${NC}"
    ((TESTS_FAILED++))
    FAILED_TESTS+=("$example_name")

    # Show collector logs for debugging
    echo -e "\n${YELLOW}Last 20 lines of collector logs:${NC}"
    get_collector_logs | tail -20
  fi
}

# Print summary
print_summary() {
  echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}Test Summary${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "Total tests: $((TESTS_PASSED + TESTS_FAILED))"
  echo -e "${GREEN}Passed: ${TESTS_PASSED}${NC}"

  if [ $TESTS_FAILED -gt 0 ]; then
    echo -e "${RED}Failed: ${TESTS_FAILED}${NC}"
    echo -e "\n${RED}Failed tests:${NC}"
    for test in "${FAILED_TESTS[@]}"; do
      echo -e "  - $test"
    done
    exit 1
  else
    echo -e "\n${GREEN}🎉 All tests passed!${NC}"
    exit 0
  fi
}

# Main execution
main() {
  echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║  @atrim/instrumentation Integration Tests         ║${NC}"
  echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}\n"

  # Start collector
  start_collector

  # Run tests for each example
  test_example "Express" "examples/express" "test/integration/test-express.sh"
  test_example "Vanilla" "examples/vanilla" "test/integration/test-vanilla.sh"
  test_example "Effect-TS + Express" "examples/effect-ts" "test/integration/test-effect-ts.sh"
  test_example "Pure Effect-TS" "examples/effect-platform" "test/integration/test-effect-platform.sh"

  # Print summary
  print_summary
}

# Run main
main "$@"
