#!/bin/bash

# Comprehensive test script for SSS Token Admin CLI
# Handles: validator startup, airdrops, program deployment, and CLI test execution

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
CLEAN_LEDGER=false
SKIP_DEPLOY=false
NO_STOP=false
VALIDATOR_PID=""
LEDGER_DIR="../sdk/test-ledger"
RPC_URL="http://localhost:8899"
LOG_DIR="../test-logs"
AIRDROP_AMOUNT=5  # SOL (CLI tests need more for transactions)
MIN_BALANCE=5  # SOL

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --clean)
            CLEAN_LEDGER=true
            shift
            ;;
        --skip-deploy)
            SKIP_DEPLOY=true
            shift
            ;;
        --no-stop)
            NO_STOP=true
            shift
            ;;
        --static-only)
            STATIC_ONLY=true
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --clean        Clean ledger and start fresh validator"
            echo "  --skip-deploy  Skip program deployment (reuse existing)"
            echo "  --no-stop      Keep validator running after tests"
            echo "  --static-only  Only run static tests (no validator needed)"
            echo "  --help         Show this help message"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Change to cli directory
cd "$(dirname "$0")"

# Create log directory
mkdir -p "$LOG_DIR"

# Function to print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if validator is running
is_validator_running() {
    if pgrep -f "solana-test-validator" > /dev/null; then
        return 0
    else
        return 1
    fi
}

# Function to start validator
start_validator() {
    print_info "Starting Solana test validator..."
    
    if is_validator_running; then
        print_warning "Validator is already running. Reusing existing instance."
        return 0
    fi
    
    # Clean ledger if requested
    if [ "$CLEAN_LEDGER" = true ]; then
        print_info "Cleaning existing ledger..."
        rm -rf "$LEDGER_DIR"
        mkdir -p "$LEDGER_DIR"
    fi
    
    # Start validator in background
    solana-test-validator \
        --ledger "$LEDGER_DIR" \
        --rpc-port 8899 \
        --quiet \
        > "$LOG_DIR/validator.log" 2>&1 &
    
    VALIDATOR_PID=$!
    
    # Wait for validator to be ready
    print_info "Waiting for validator to start (PID: $VALIDATOR_PID)..."
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if solana cluster-version > /dev/null 2>&1; then
            print_success "Validator is ready!"
            return 0
        fi
        sleep 1
        attempt=$((attempt + 1))
        echo -n "."
    done
    
    echo ""
    print_error "Validator failed to start within $max_attempts seconds"
    print_info "Check logs at: $LOG_DIR/validator.log"
    exit 1
}

# Function to request airdrop
request_airdrop() {
    print_info "Checking payer balance..."
    
    # Get current balance
    local balance
    balance=$(solana balance --output json 2>/dev/null | jq -r '.balance' 2>/dev/null || echo "0")
    balance=$(echo "$balance" | awk '{printf "%.0f", $1}')
    
    print_info "Current balance: $balance SOL"
    
    # Request airdrop if balance is below minimum
    if [ "$balance" -lt "$MIN_BALANCE" ]; then
        print_info "Requesting airdrop of $AIRDROP_AMOUNT SOL..."
        
        local airdrop_tx
        if airdrop_tx=$(solana airdrop "$AIRDROP_AMOUNT" 2>&1); then
            print_success "Airdrop successful"
        else
            print_warning "Airdrop failed (this is normal on localnet)"
            print_info "You may need to fund your wallet manually"
        fi
    else
        print_success "Sufficient balance ($balance SOL)"
    fi
}

# Function to deploy program
deploy_program() {
    if [ "$SKIP_DEPLOY" = true ]; then
        print_info "Skipping program deployment (--skip-deploy flag set)"
        return 0
    fi
    
    print_info "Building Anchor programs..."
    cd ..
    if anchor build; then
        print_success "Build successful"
    else
        print_error "Build failed"
        exit 1
    fi
    
    print_info "Deploying sss-token program..."
    if anchor deploy --program-name sss_token; then
        print_success "Deployment successful"
    else
        print_error "Deployment failed"
        exit 1
    fi
    
    cd cli
}

# Function to build CLI
build_cli() {
    print_info "Building CLI..."
    
    if npm run build; then
        print_success "CLI build successful"
    else
        print_error "CLI build failed"
        exit 1
    fi
}

# Function to run static tests (no ledger needed)
run_static_tests() {
    print_info "Running static CLI tests..."
    local failed=0
    
    # Test 1: Help command
    print_info "Test: --help"
    if node dist/index.js --help > /dev/null 2>&1; then
        print_success "--help works"
    else
        print_error "--help failed"
        failed=$((failed + 1))
    fi
    
    # Test 2: Version command
    print_info "Test: --version"
    if node dist/index.js --version > /dev/null 2>&1; then
        print_success "--version works"
    else
        print_error "--version failed"
        failed=$((failed + 1))
    fi
    
    # Test 3: Config command
    print_info "Test: config"
    if node dist/index.js config > /dev/null 2>&1; then
        print_success "config works"
    else
        print_error "config failed"
        failed=$((failed + 1))
    fi
    
    # Test 4: Help for subcommands
    print_info "Test: init --help"
    if node dist/index.js init --help > /dev/null 2>&1; then
        print_success "init --help works"
    else
        print_error "init --help failed"
        failed=$((failed + 1))
    fi
    
    print_info "Test: mint --help"
    if node dist/index.js mint --help > /dev/null 2>&1; then
        print_success "mint --help works"
    else
        print_error "mint --help failed"
        failed=$((failed + 1))
    fi
    
    print_info "Test: blacklist --help"
    if node dist/index.js blacklist --help > /dev/null 2>&1; then
        print_success "blacklist --help works"
    else
        print_error "blacklist --help failed"
        failed=$((failed + 1))
    fi
    
    return $failed
}

# Function to run integration tests (requires validator)
run_integration_tests() {
    print_info "Running integration CLI tests..."
    local failed=0
    
    # Set environment for CLI
    export ANCHOR_PROVIDER_URL="http://localhost:8899"
    
    # Test 1: Initialize stablecoin (SSS-1 preset)
    print_info "Test: init --preset sss-1 --name TestCoin --symbol TEST --yes"
    if node dist/index.js init --preset sss-1 --name "TestCoin" --symbol "TEST" --yes 2>&1; then
        print_success "init successful"
    else
        print_error "init failed"
        failed=$((failed + 1))
    fi
    
    # Check if config file was created
    if [ -f ".sss-token.json" ]; then
        print_success "Config file created"
        
        # Get mint address from config
        MINT=$(cat .sss-token.json | jq -r '.mint')
        print_info "Mint address: $MINT"
    else
        print_error "Config file not created"
        failed=$((failed + 1))
        return $failed
    fi
    
    # Test 2: Status command
    print_info "Test: status"
    if node dist/index.js status 2>&1; then
        print_success "status works"
    else
        print_error "status failed"
        failed=$((failed + 1))
    fi
    
    # Test 3: Supply command
    print_info "Test: supply"
    if node dist/index.js supply 2>&1; then
        print_success "supply works"
    else
        print_error "supply failed"
        failed=$((failed + 1))
    fi
    
    # Test 4: Balance command
    print_info "Test: balance"
    if node dist/index.js balance 2>&1; then
        print_success "balance works"
    else
        print_error "balance failed"
        failed=$((failed + 1))
    fi
    
    # Test 5: Minters list
    print_info "Test: minters list"
    if node dist/index.js minters list 2>&1; then
        print_success "minters list works"
    else
        print_error "minters list failed"
        failed=$((failed + 1))
    fi
    
    # Test 6: Pause
    print_info "Test: pause"
    if node dist/index.js pause 2>&1; then
        print_success "pause works"
    else
        print_error "pause failed"
        failed=$((failed + 1))
    fi
    
    # Test 7: Unpause
    print_info "Test: unpause"
    if node dist/index.js unpause 2>&1; then
        print_success "unpause works"
    else
        print_error "unpause failed"
        failed=$((failed + 1))
    fi
    
    # Test 8: Add minter (required before minting)
    print_info "Test: minters add <wallet>"
    WALLET=$(solana address)
    if node dist/index.js minters add "$WALLET" --quota 1000000000000 2>&1; then
        print_success "minters add works"
    else
        print_error "minters add failed"
        failed=$((failed + 1))
    fi
    
    # Test 9: Mint tokens (to self)
    print_info "Test: mint <wallet> 100"
    if node dist/index.js mint "$WALLET" 100 2>&1; then
        print_success "mint works"
    else
        print_error "mint failed"
        failed=$((failed + 1))
    fi
    
    # Test 9: Balance after mint
    print_info "Test: balance (after mint)"
    if node dist/index.js balance 2>&1; then
        print_success "balance after mint works"
    else
        print_error "balance after mint failed"
        failed=$((failed + 1))
    fi
    
    # Test 10: Burn tokens
    print_info "Test: burn 10"
    if node dist/index.js burn 10 2>&1; then
        print_success "burn works"
    else
        print_error "burn failed"
        failed=$((failed + 1))
    fi
    
    # Test 11: Roles command
    print_info "Test: roles update"
    if node dist/index.js roles update 2>&1; then
        print_success "roles update works"
    else
        print_error "roles update failed"
        failed=$((failed + 1))
    fi
    
    # Test 12: Blacklist check (should not be blacklisted)
    print_info "Test: blacklist check"
    if node dist/index.js blacklist check "$WALLET" 2>&1; then
        print_success "blacklist check works"
    else
        print_error "blacklist check failed"
        failed=$((failed + 1))
    fi
    
    # Test 13: Config with mint
    print_info "Test: config"
    if node dist/index.js config 2>&1; then
        print_success "config works"
    else
        print_error "config failed"
        failed=$((failed + 1))
    fi
    
    return $failed
}

# Function to cleanup
cleanup() {
    if [ "$NO_STOP" = true ]; then
        print_info "Keeping validator running (--no-stop flag set)"
        print_info "Validator PID: $VALIDATOR_PID"
        print_info "To stop validator manually: kill $VALIDATOR_PID"
        return 0
    fi
    
    if [ -n "$VALIDATOR_PID" ]; then
        print_info "Stopping validator (PID: $VALIDATOR_PID)..."
        kill $VALIDATOR_PID 2>/dev/null || true
        sleep 2
        
        # Force kill if still running
        if is_validator_running; then
            print_warning "Force killing validator..."
            pkill -f "solana-test-validator" || true
        fi
        
        print_success "Validator stopped"
    fi
}

# Main execution
main() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  SSS Token Admin CLI Test Runner${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    
    local total_failed=0
    
    # Step 1: Build CLI
    build_cli
    
    # Step 2: Run static tests
    echo ""
    echo -e "${BLUE}--- Static Tests ---${NC}"
    run_static_tests || total_failed=$?
    
    # If static-only mode, exit here
    if [ "$STATIC_ONLY" = true ]; then
        echo ""
        if [ $total_failed -eq 0 ]; then
            echo -e "${GREEN}All static tests passed!${NC}"
        else
            echo -e "${RED}$total_failed static tests failed${NC}"
        fi
        exit $total_failed
    fi
    
    # Set up cleanup trap for integration tests
    trap cleanup EXIT INT TERM
    
    # Step 3: Start validator
    echo ""
    echo -e "${BLUE}--- Integration Tests ---${NC}"
    start_validator
    
    # Step 4: Request airdrop if needed
    request_airdrop
    
    # Step 5: Deploy program
    deploy_program
    
    # Step 6: Run integration tests
    echo ""
    run_integration_tests || total_failed=$((total_failed + $?))
    
    echo ""
    echo -e "${BLUE}========================================${NC}"
    if [ $total_failed -eq 0 ]; then
        echo -e "${GREEN}  All CLI tests passed!${NC}"
    else
        echo -e "${RED}  $total_failed tests failed${NC}"
    fi
    echo -e "${BLUE}========================================${NC}"
    
    exit $total_failed
}

# Run main function
main