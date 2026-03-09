#!/bin/bash

# Comprehensive test script for SSS Token SDK
# Handles: validator startup, airdrops, program deployment, and test execution

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
LEDGER_DIR="sdk/test-ledger"
RPC_URL="http://localhost:8899"
LOG_DIR="test-logs"
AIRDROP_AMOUNT=2  # SOL
MIN_BALANCE=2  # SOL

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
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --clean        Clean ledger and start fresh validator"
            echo "  --skip-deploy  Skip program deployment (reuse existing)"
            echo "  --no-stop      Keep validator running after tests"
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

# Change to sss-token directory
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
    balance=$(solana balance --output json | jq -r '.balance' 2>/dev/null || echo "0")
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
    
    # Deploy transfer-hook if it exists
    if [ -f "programs/transfer-hook/src/lib.rs" ]; then
        print_info "Deploying transfer-hook program..."
        if anchor deploy --program-name transfer_hook; then
            print_success "Transfer-hook deployment successful"
        else
            print_warning "Transfer-hook deployment failed (may be optional)"
        fi
    fi
}

# Function to run SDK tests
run_sdk_tests() {
    print_info "Running SDK tests..."
    
    cd sdk
    
    if npm test; then
        print_success "All tests passed!"
    else
        print_error "Some tests failed"
        print_info "Check test output above for details"
        cd ..
        return 1
    fi
    
    cd ..
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
    echo -e "${BLUE}  SSS Token SDK Test Runner${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    
    # Set up cleanup trap
    trap cleanup EXIT INT TERM
    
    # Step 1: Start validator
    start_validator
    
    # Step 2: Request airdrop if needed
    request_airdrop
    
    # Step 3: Deploy program
    deploy_program
    
    # Step 4: Run SDK tests
    run_sdk_tests
    
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${GREEN}  All tests completed successfully!${NC}"
    echo -e "${BLUE}========================================${NC}"
}

# Run main function
main