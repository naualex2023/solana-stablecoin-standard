#!/bin/bash

# Test script for SSS Token on Localnet
# This script runs tests against an already-running local validator
# Use with: backend/start-localnet.sh --detach (starts validator + backend services)

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
RPC_URL="http://localhost:8899"
WS_URL="ws://localhost:8900"
PROGRAM_ID="Hf1s4EvjS79S6kcHdKhaZHVQsnsjqMbJgBEFZfaGDPmw"
INDEXER_API_URL="http://localhost:3004"

# Test options
TEST_TYPE="sdk"  # sdk or backend
VERIFY_EVENTS=true

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --sdk)
            TEST_TYPE="sdk"
            shift
            ;;
        --backend)
            TEST_TYPE="backend"
            shift
            ;;
        --no-verify)
            VERIFY_EVENTS=false
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Test script for SSS Token on Localnet"
            echo "Assumes validator and backend services are already running."
            echo ""
            echo "Prerequisites:"
            echo "  1. Start localnet: cd backend && ./start-localnet.sh --detach"
            echo "  2. Wait for services to be ready"
            echo ""
            echo "Options:"
            echo "  --sdk         Run SDK tests (default)"
            echo "  --backend     Verify backend services only"
            echo "  --no-verify   Skip event verification"
            echo "  --help        Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                    # Run SDK tests"
            echo "  $0 --backend          # Verify backend services only"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Change to sss-token directory
cd "$(dirname "$0")"

# Logging functions
print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }
print_step() { echo -e "${CYAN}[STEP]${NC} $1"; }
print_test() { echo -e "${MAGENTA}[TEST]${NC} $1"; }

# Check if validator is running
check_validator() {
    print_step "Checking local validator..."
    
    local response=$(curl -s -X POST -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
        "$RPC_URL" 2>/dev/null)
    
    if echo "$response" | grep -q '"result":"ok"'; then
        print_success "Validator is running at $RPC_URL"
        return 0
    else
        print_error "Validator is not running!"
        print_info "Start it with: cd backend && ./start-localnet.sh --detach"
        exit 1
    fi
}

# Check if backend services are running
check_backend() {
    print_step "Checking backend services..."
    
    # Check Indexer API
    local indexer_health=$(curl -s "$INDEXER_API_URL/health" 2>/dev/null)
    if [ -n "$indexer_health" ]; then
        print_success "Indexer API is running at $INDEXER_API_URL"
    else
        print_warning "Indexer API not responding (events won't be captured)"
    fi
}

# Check wallet balance
check_balance() {
    print_step "Checking wallet balance..."
    
    solana config set --url localhost > /dev/null 2>&1
    
    local balance=$(solana balance 2>/dev/null | awk '{print $1}')
    
    if [ -z "$balance" ] || [ "$balance" = "0" ]; then
        print_info "Requesting airdrop..."
        solana airdrop 100 > /dev/null 2>&1
        solana airdrop 100 > /dev/null 2>&1
        balance=$(solana balance 2>/dev/null | awk '{print $1}')
    fi
    
    print_success "Wallet balance: ${balance:-0} SOL"
}

# Run SDK tests
run_sdk_tests() {
    print_test "Running SDK Enhanced Tests..."
    echo ""
    
    # Set environment for tests
    export ANCHOR_PROVIDER_URL="$RPC_URL"
    export ANCHOR_WALLET="$HOME/.config/solana/id.json"
    
    if npx ts-mocha "sdk/tests/sdk-enhanced.test.ts" --timeout 100000; then
        print_success "SDK tests passed!"
        return 0
    else
        print_error "SDK tests failed!"
        return 1
    fi
}

# Verify events were captured by the indexer
verify_events() {
    if [ "$VERIFY_EVENTS" = false ]; then
        print_info "Skipping event verification (--no-verify)"
        return 0
    fi
    
    print_step "Verifying captured events..."
    
    # Wait a moment for events to be processed
    sleep 3
    
    # Query stats
    print_info "Querying indexer stats..."
    local stats=$(curl -s "$INDEXER_API_URL/api/stats" 2>/dev/null)
    echo "Stats: $stats"
    
    # Query events
    print_info "Querying events from Indexer API..."
    local events=$(curl -s "$INDEXER_API_URL/api/events?limit=10" 2>/dev/null)
    echo "Events (last 10): $events"
    
    # Query stablecoins
    print_info "Querying stablecoins from Indexer API..."
    local stablecoins=$(curl -s "$INDEXER_API_URL/api/stablecoins" 2>/dev/null)
    echo "Stablecoins: $stablecoins"
    
    # Check if we got any data
    if echo "$stats" | grep -q '"totalEvents":[1-9]'; then
        print_success "Events found in indexer!"
    else
        print_warning "No events found in indexer"
    fi
}

# Verify backend services
run_backend_verification() {
    print_test "Verifying Backend Services..."
    echo ""
    
    # Check each service
    local services_ok=true
    
    # Indexer API
    print_info "Checking Indexer API (port 3004)..."
    if curl -s "http://localhost:3004/health" > /dev/null 2>&1; then
        print_success "Indexer API: OK"
    else
        print_error "Indexer API: NOT RESPONDING"
        services_ok=false
    fi
    
    # Mint/Burn Service
    print_info "Checking Mint/Burn Service (port 3001)..."
    if curl -s "http://localhost:3001/health" > /dev/null 2>&1; then
        print_success "Mint/Burn Service: OK"
    else
        print_warning "Mint/Burn Service: NOT RESPONDING"
    fi
    
    # Compliance Service
    print_info "Checking Compliance Service (port 3002)..."
    if curl -s "http://localhost:3002/health" > /dev/null 2>&1; then
        print_success "Compliance Service: OK"
    else
        print_warning "Compliance Service: NOT RESPONDING"
    fi
    
    # Webhook Service
    print_info "Checking Webhook Service (port 3003)..."
    if curl -s "http://localhost:3003/health" > /dev/null 2>&1; then
        print_success "Webhook Service: OK"
    else
        print_warning "Webhook Service: NOT RESPONDING"
    fi
    
    # Verify events
    verify_events
    
    if [ "$services_ok" = true ]; then
        print_success "All backend services verified!"
        return 0
    else
        print_warning "Some backend services not responding"
        return 1
    fi
}

# Display summary
display_summary() {
    echo ""
    echo -e "${MAGENTA}========================================${NC}"
    echo -e "${MAGENTA}  Localnet Test Summary${NC}"
    echo -e "${MAGENTA}========================================${NC}"
    echo ""
    echo "Configuration:"
    echo "  - RPC URL:      $RPC_URL"
    echo "  - Program ID:   $PROGRAM_ID"
    echo "  - Indexer API:  $INDEXER_API_URL"
    echo ""
    echo "Test Results:"
    echo "  - Test Type:    $TEST_TYPE"
    echo "  - Verify Events: $VERIFY_EVENTS"
    echo ""
    echo -e "${MAGENTA}========================================${NC}"
}

# Main execution
main() {
    echo ""
    echo -e "${MAGENTA}========================================${NC}"
    echo -e "${MAGENTA}  SSS Token Localnet Test Runner${NC}"
    echo -e "${MAGENTA}========================================${NC}"
    echo ""
    
    # Check prerequisites
    check_validator
    check_backend
    check_balance
    
    echo ""
    
    local exit_code=0
    
    case $TEST_TYPE in
        sdk)
            run_sdk_tests || exit_code=1
            echo ""
            verify_events
            ;;
        backend)
            run_backend_verification || exit_code=1
            ;;
    esac
    
    display_summary
    
    if [ $exit_code -eq 0 ]; then
        echo -e "${GREEN}All tests completed successfully!${NC}"
    else
        echo -e "${RED}Some tests failed. Check output above.${NC}"
    fi
    
    exit $exit_code
}

# Run main function
main