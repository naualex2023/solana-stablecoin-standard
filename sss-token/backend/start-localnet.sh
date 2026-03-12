#!/bin/bash

# ============================================
# SSS Token Backend - Localnet Testing
# ============================================
# This script starts a complete local testing environment:
# - Local Solana validator with deployed programs
# - PostgreSQL and Redis (via Docker)
# - Backend services (Indexer, APIs)
# - Runs tests and verifies events are captured

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
BACKEND_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$BACKEND_DIR")"
PID_DIR="$BACKEND_DIR/.pids-localnet"
LOG_DIR="$BACKEND_DIR/.logs-localnet"
VALIDATOR_LOG="$LOG_DIR/validator.log"

# Localnet configuration
SOLANA_RPC_URL="http://localhost:8899"
SOLANA_WS_URL="ws://localhost:8900"
SSS_PROGRAM_ID="Hf1s4EvjS79S6kcHdKhaZHVQsnsjqMbJgBEFZfaGDPmw"
TRANSFER_HOOK_PROGRAM_ID="az3oVrACpVrCJbgGhKueYhTWobmte2AwYgMp1cAzdKD"

# Ensure directories exist
mkdir -p "$PID_DIR" "$LOG_DIR"

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${CYAN}[STEP]${NC} $1"; }
log_section() { echo -e "${MAGENTA}========================================\n  $1\n========================================${NC}"; }

# ============================================
# Utility Functions
# ============================================

is_running() {
    local pid_file="$1"
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            return 0
        fi
    fi
    return 1
}

stop_process() {
    local pid_file="$1"
    local name="$2"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            log_info "Stopping $name (PID: $pid)..."
            kill "$pid" 2>/dev/null
            sleep 2
            if kill -0 "$pid" 2>/dev/null; then
                kill -9 "$pid" 2>/dev/null
            fi
            log_success "$name stopped"
        else
            log_info "$name is not running"
        fi
        rm -f "$pid_file"
    else
        log_info "$name PID file not found"
    fi
}

check_port() {
    local port="$1"
    if lsof -i :$port > /dev/null 2>&1; then
        return 0
    fi
    return 1
}

wait_for_port() {
    local port="$1"
    local name="$2"
    local timeout="${3:-60}"
    
    log_info "Waiting for $name on port $port..."
    for i in $(seq 1 $timeout); do
        if check_port "$port"; then
            log_success "$name is ready"
            return 0
        fi
        sleep 1
    done
    log_error "$name failed to start within ${timeout}s"
    return 1
}

# ============================================
# Build Solana Programs
# ============================================

build_programs() {
    log_step "Building Solana programs..."
    cd "$PROJECT_ROOT"
    
    # Check if anchor is installed
    if ! command -v anchor &> /dev/null; then
        log_error "Anchor CLI not found. Please install Anchor first."
        exit 1
    fi
    
    # Build programs
    log_info "Running anchor build..."
    anchor build
    
    if [ $? -ne 0 ]; then
        log_error "Failed to build programs"
        exit 1
    fi
    
    log_success "Programs built successfully"
}

# ============================================
# Start Local Validator
# ============================================

start_validator() {
    log_step "Starting local Solana validator..."
    
    # Check if solana-test-validator is installed
    if ! command -v solana-test-validator &> /dev/null; then
        log_error "solana-test-validator not found."
        exit 1
    fi
    
    # Check if validator is already running
    if is_running "$PID_DIR/validator.pid"; then
        log_warning "Validator already running"
        return 0
    fi
    
    # Check if programs are built
    local sss_program_so="$PROJECT_ROOT/target/deploy/sss_token.so"
    local transfer_hook_so="$PROJECT_ROOT/target/deploy/transfer_hook.so"
    
    if [ ! -f "$sss_program_so" ]; then
        log_warning "SSS Token program not found. Building..."
        build_programs
    fi
    
    # Configure solana to use localnet
    solana config set --url localhost
    
    # Kill any existing validator on port 8899
    if check_port 8899; then
        log_warning "Port 8899 already in use, killing existing process..."
        lsof -ti :8899 | xargs kill -9 2>/dev/null || true
        sleep 2
    fi
    
    # Start the validator
    log_info "Starting validator with deployed programs..."
    solana-test-validator \
        --rpc-port 8899 \
        --ledger "$LOG_DIR/test-ledger" \
        --bpf-program "$SSS_PROGRAM_ID" "$sss_program_so" \
        --bpf-program "$TRANSFER_HOOK_PROGRAM_ID" "$transfer_hook_so" \
        --reset \
        > "$VALIDATOR_LOG" 2>&1 &
    
    echo $! > "$PID_DIR/validator.pid"
    
    # Wait for validator to be ready
    wait_for_port 8899 "Validator" 90
    
    # Additional wait for validator to fully initialize
    log_info "Waiting for validator to initialize..."
    sleep 5
    
    # Verify connection
    local slot=$(solana slot 2>/dev/null || echo "failed")
    if [ "$slot" = "failed" ]; then
        log_error "Failed to connect to validator"
        log_info "Check validator logs: $VALIDATOR_LOG"
        exit 1
    fi
    
    log_success "Validator running at slot: $slot"
}

# ============================================
# Airdrop SOL to Test Wallet
# ============================================

airdrop_wallet() {
    log_step "Airdropping SOL to test wallet..."
    
    solana config set --url localhost
    
    # Airdrop 100 SOL
    log_info "Requesting airdrop..."
    solana airdrop 100 > /dev/null 2>&1
    solana airdrop 100 > /dev/null 2>&1
    solana airdrop 100 > /dev/null 2>&1
    
    # Check balance
    local balance=$(solana balance 2>/dev/null | awk '{print $1}')
    log_success "Balance: ${balance:-0} SOL"
}

# ============================================
# Status Command
# ============================================

show_status() {
    echo ""
    echo "========================================"
    echo "  SSS Token Backend - Localnet Status"
    echo "========================================"
    echo ""
    
    # Validator
    if is_running "$PID_DIR/validator.pid"; then
        echo -e "Validator:         ${GREEN}RUNNING${NC} (PID: $(cat $PID_DIR/validator.pid))"
    else
        echo -e "Validator:         ${RED}STOPPED${NC}"
    fi
    
    # PostgreSQL
    if docker-compose -f "$BACKEND_DIR/docker-compose.yml" ps postgres 2>/dev/null | grep -q "Up"; then
        echo -e "PostgreSQL:        ${GREEN}RUNNING${NC}"
    else
        echo -e "PostgreSQL:        ${RED}STOPPED${NC}"
    fi
    
    # Redis
    if docker-compose -f "$BACKEND_DIR/docker-compose.yml" ps redis 2>/dev/null | grep -q "Up"; then
        echo -e "Redis:             ${GREEN}RUNNING${NC}"
    else
        echo -e "Redis:             ${RED}STOPPED${NC}"
    fi
    
    # Backend Services
    for service in indexer indexer-api mint-burn compliance webhook; do
        if is_running "$PID_DIR/$service.pid"; then
            echo -e "$(echo $service | sed 's/.*/\u&'):        ${GREEN}RUNNING${NC} (PID: $(cat $PID_DIR/$service.pid))"
        else
            echo -e "$(echo $service | sed 's/.*/\u&'):        ${RED}STOPPED${NC}"
        fi
    done
    
    echo ""
    echo "Configuration:"
    echo "  - Solana RPC:     $SOLANA_RPC_URL"
    echo "  - Program ID:     $SSS_PROGRAM_ID"
    echo ""
}

# ============================================
# Stop Command
# ============================================

stop_all() {
    echo ""
    echo "========================================"
    echo "  Stopping All Localnet Services"
    echo "========================================"
    echo ""
    
    # Stop backend services
    stop_process "$PID_DIR/webhook.pid" "Webhook Service"
    stop_process "$PID_DIR/compliance.pid" "Compliance Service"
    stop_process "$PID_DIR/mint-burn.pid" "Mint/Burn Service"
    stop_process "$PID_DIR/indexer-api.pid" "Indexer API"
    stop_process "$PID_DIR/indexer.pid" "Indexer"
    
    # Stop validator
    stop_process "$PID_DIR/validator.pid" "Validator"
    
    # Clean up validator ledger
    if [ -d "$LOG_DIR/test-ledger" ]; then
        log_info "Cleaning up validator ledger..."
        rm -rf "$LOG_DIR/test-ledger"
    fi
    
    # Stop Docker containers
    log_info "Stopping Docker containers..."
    cd "$BACKEND_DIR"
    docker-compose down 2>/dev/null || true
    log_success "Docker containers stopped"
    
    # Clean up PID directory
    rm -rf "$PID_DIR"
    
    log_success "All services stopped"
}

# ============================================
# Start Infrastructure (PostgreSQL + Redis)
# ============================================

start_infrastructure() {
    log_step "Starting infrastructure services..."
    cd "$BACKEND_DIR"
    
    # Start PostgreSQL and Redis
    docker-compose up -d postgres redis
    
    # Wait for PostgreSQL
    log_info "Waiting for PostgreSQL..."
    for i in {1..30}; do
        if docker-compose exec -T postgres pg_isready -U sss > /dev/null 2>&1; then
            log_success "PostgreSQL is ready"
            break
        fi
        sleep 1
    done
    
    # Wait for Redis
    log_info "Waiting for Redis..."
    for i in {1..30}; do
        if docker-compose exec -T redis redis-cli -a "sss_redis_secret" ping 2>/dev/null | grep -q PONG; then
            log_success "Redis is ready"
            break
        fi
        sleep 1
    done
}

# ============================================
# Setup Environment for Localnet
# ============================================

setup_localnet_env() {
    log_step "Setting up localnet environment..."
    
    # Create .env.localnet file for backend
    cat > "$BACKEND_DIR/.env.localnet" << EOF
# ============================================
# SSS Token Backend - Localnet Configuration
# ============================================

# Solana Configuration
SOLANA_RPC_URL=$SOLANA_RPC_URL
SOLANA_WS_URL=$SOLANA_WS_URL
SSS_PROGRAM_ID=$SSS_PROGRAM_ID
COMMITMENT=confirmed

# Database Configuration
DATABASE_URL=postgresql://sss:sss_secret@localhost:5432/sss_token
POSTGRES_USER=sss
POSTGRES_PASSWORD=sss_secret
POSTGRES_DB=sss_token
POSTGRES_PORT=5432

# Redis Configuration
REDIS_URL=redis://:sss_redis_secret@localhost:6379
REDIS_PASSWORD=sss_redis_secret
REDIS_PORT=6379

# Service Ports
MINT_BURN_PORT=3001
COMPLIANCE_PORT=3002
WEBHOOK_PORT=3003

# Logging
LOG_LEVEL=debug
NODE_ENV=development

# Indexer Configuration
INDEXER_MODE=websocket

# Webhook Configuration
WEBHOOK_SECRET=localnet-testing-secret
EOF

    log_success "Created .env.localnet file"
    
    # Copy to .env for services
    cp "$BACKEND_DIR/.env.localnet" "$BACKEND_DIR/.env"
    log_success "Copied to .env"
}

# ============================================
# Build Services
# ============================================

build_services() {
    log_step "Building backend services..."
    cd "$BACKEND_DIR"
    
    # Install dependencies and build
    if command -v pnpm &> /dev/null; then
        pnpm install
        pnpm run build
    else
        npm install
        npm run build
    fi
    
    log_success "Services built"
}

# ============================================
# Start Backend Services
# ============================================

start_backend_services() {
    log_step "Starting backend services..."
    
    # Load environment variables
    if [ -f "$BACKEND_DIR/.env.localnet" ]; then
        log_info "Loading environment from .env.localnet..."
        set -a
        source "$BACKEND_DIR/.env.localnet"
        set +a
    else
        log_error "No .env.localnet file found. Run setup first."
        exit 1
    fi
    
    # Indexer
    if is_running "$PID_DIR/indexer.pid"; then
        log_warning "Indexer already running"
    else
        log_info "Starting Indexer..."
        cd "$BACKEND_DIR/packages/indexer"
        NODE_ENV=development \
        SOLANA_RPC_URL="$SOLANA_RPC_URL" \
        SOLANA_WS_URL="$SOLANA_WS_URL" \
        SSS_PROGRAM_ID="$SSS_PROGRAM_ID" \
        DATABASE_URL="$DATABASE_URL" \
        REDIS_URL="$REDIS_URL" \
        LOG_LEVEL=debug \
        INDEXER_MODE=websocket \
        node dist/index.js > "$LOG_DIR/indexer.log" 2>&1 &
        echo $! > "$PID_DIR/indexer.pid"
        sleep 2
    fi
    
    # Indexer API
    if is_running "$PID_DIR/indexer-api.pid"; then
        log_warning "Indexer API already running"
    else
        log_info "Starting Indexer API..."
        cd "$BACKEND_DIR/packages/indexer-api"
        NODE_ENV=development \
        PORT=3004 \
        SOLANA_RPC_URL="$SOLANA_RPC_URL" \
        SSS_PROGRAM_ID="$SSS_PROGRAM_ID" \
        DATABASE_URL="$DATABASE_URL" \
        POSTGRES_HOST=localhost \
        POSTGRES_PORT=5432 \
        POSTGRES_USER=sss \
        POSTGRES_PASSWORD=sss_secret \
        POSTGRES_DB=sss_token \
        LOG_LEVEL=debug \
        node dist/index.js > "$LOG_DIR/indexer-api.log" 2>&1 &
        echo $! > "$PID_DIR/indexer-api.pid"
        sleep 2
    fi
    
    # Mint/Burn Service
    if is_running "$PID_DIR/mint-burn.pid"; then
        log_warning "Mint/Burn service already running"
    else
        log_info "Starting Mint/Burn Service..."
        cd "$BACKEND_DIR/packages/mint-burn-service"
        NODE_ENV=development \
        PORT=3001 \
        SOLANA_RPC_URL="$SOLANA_RPC_URL" \
        SSS_PROGRAM_ID="$SSS_PROGRAM_ID" \
        DATABASE_URL="$DATABASE_URL" \
        REDIS_URL="$REDIS_URL" \
        LOG_LEVEL=debug \
        node dist/index.js > "$LOG_DIR/mint-burn.log" 2>&1 &
        echo $! > "$PID_DIR/mint-burn.pid"
        sleep 2
    fi
    
    # Compliance Service
    if is_running "$PID_DIR/compliance.pid"; then
        log_warning "Compliance service already running"
    else
        log_info "Starting Compliance Service..."
        cd "$BACKEND_DIR/packages/compliance-service"
        NODE_ENV=development \
        PORT=3002 \
        SOLANA_RPC_URL="$SOLANA_RPC_URL" \
        SSS_PROGRAM_ID="$SSS_PROGRAM_ID" \
        DATABASE_URL="$DATABASE_URL" \
        REDIS_URL="$REDIS_URL" \
        LOG_LEVEL=debug \
        node dist/index.js > "$LOG_DIR/compliance.log" 2>&1 &
        echo $! > "$PID_DIR/compliance.pid"
        sleep 2
    fi
    
    # Webhook Service
    if is_running "$PID_DIR/webhook.pid"; then
        log_warning "Webhook service already running"
    else
        log_info "Starting Webhook Service..."
        cd "$BACKEND_DIR/packages/webhook-service"
        NODE_ENV=development \
        PORT=3003 \
        DATABASE_URL="$DATABASE_URL" \
        REDIS_URL="$REDIS_URL" \
        LOG_LEVEL=debug \
        node dist/index.js > "$LOG_DIR/webhook.log" 2>&1 &
        echo $! > "$PID_DIR/webhook.pid"
        sleep 2
    fi
    
    # Health checks
    log_info "Checking service health..."
    sleep 3
    
    for port in 3001 3002 3003 3004; do
        if curl -s "http://localhost:$port/health" > /dev/null 2>&1; then
            log_success "Service on port $port is healthy"
        else
            log_warning "Service on port $port may not be ready yet"
        fi
    done
}

# ============================================
# Run Tests
# ============================================

run_tests() {
    log_step "Running localnet tests..."
    cd "$PROJECT_ROOT"
    
    # Set environment for tests
    export ANCHOR_PROVIDER_URL="http://localhost:8899"
    export ANCHOR_WALLET="$HOME/.config/solana/id.json"
    
    # Run the test
    if [ -f "$PROJECT_ROOT/tests/localnet-test.ts" ]; then
        npx ts-mocha -t 300000 tests/localnet-test.ts
    else
        log_warning "No localnet-test.ts found, running devnet tests against localnet..."
        npx ts-mocha -t 300000 tests/devnet-test.ts
    fi
}

# ============================================
# Verify Events
# ============================================

verify_events() {
    log_step "Verifying events were captured..."
    
    # Query the API
    log_info "Querying Indexer API for stablecoins..."
    local stablecoins=$(curl -s http://localhost:3004/api/stablecoins 2>/dev/null)
    echo "Stablecoins: $stablecoins"
    
    log_info "Querying Indexer API for events..."
    local events=$(curl -s http://localhost:3004/api/events 2>/dev/null)
    echo "Events: $events"
    
    # Check database directly
    log_info "Checking database directly..."
    cd "$BACKEND_DIR"
    docker-compose exec -T postgres psql -U sss -d sss_token -c "SELECT COUNT(*) as event_count FROM events;" 2>/dev/null
}

# ============================================
# Show Logs
# ============================================

show_logs() {
    local service="$1"
    
    if [ -z "$service" ]; then
        echo "Available logs:"
        echo "  - validator"
        echo "  - indexer"
        echo "  - indexer-api"
        echo "  - mint-burn"
        echo "  - compliance"
        echo "  - webhook"
        echo ""
        echo "Usage: $0 --logs <service>"
        return
    fi
    
    local log_file="$LOG_DIR/$service.log"
    if [ -f "$log_file" ]; then
        tail -f "$log_file"
    else
        log_error "Log file not found: $log_file"
    fi
}

# ============================================
# Main Start Function
# ============================================

start_all() {
    echo ""
    echo "========================================"
    echo "  SSS Token Backend - Localnet Testing"
    echo "========================================"
    echo ""
    
    # Check prerequisites
    command -v docker > /dev/null || { log_error "docker not found"; exit 1; }
    command -v node > /dev/null || { log_error "node not found"; exit 1; }
    command -v solana-test-validator > /dev/null || { log_error "solana-test-validator not found"; exit 1; }
    
    # Build programs if needed
    if [ "$SKIP_BUILD" = false ]; then
        build_programs
    fi
    
    # Start local validator
    start_validator
    
    # Airdrop SOL
    airdrop_wallet
    
    # Start infrastructure (PostgreSQL + Redis)
    start_infrastructure
    
    # Setup environment
    setup_localnet_env
    
    # Build backend services if needed
    if [ "$SKIP_BUILD" = false ]; then
        build_services
    fi
    
    # Start backend services
    start_backend_services
    
    # Run tests if requested
    if [ "$RUN_TESTS" = true ]; then
        run_tests
        verify_events
    fi
    
    echo ""
    echo "========================================"
    log_success "All services are running on Localnet!"
    echo "========================================"
    echo ""
    echo "Configuration:"
    echo "  - Solana RPC:     $SOLANA_RPC_URL"
    echo "  - Solana WS:      $SOLANA_WS_URL"
    echo "  - Program ID:     $SSS_PROGRAM_ID"
    echo ""
    echo "Services:"
    echo "  - Indexer API:    http://localhost:3004"
    echo "  - Mint/Burn API:  http://localhost:3001"
    echo "  - Compliance API: http://localhost:3002"
    echo "  - Webhook API:    http://localhost:3003"
    echo ""
    echo "API Endpoints:"
    echo "  - GET  http://localhost:3004/api/stablecoins"
    echo "  - GET  http://localhost:3004/api/events"
    echo ""
    echo "Commands:"
    echo "  $0 --status    Show service status"
    echo "  $0 --stop      Stop all services"
    echo "  $0 --logs svc  View logs"
    echo "  $0 --test      Run tests and verify events"
    echo ""
    echo "Log files: $LOG_DIR"
    echo ""
    
    # Keep script running if --detach not specified
    if [ "$DETACH" = false ]; then
        log_info "Press Ctrl+C to stop all services..."
        trap stop_all EXIT
        wait
    fi
}

# ============================================
# Command Line Interface
# ============================================

# Parse arguments
SKIP_BUILD=false
DETACH=false
RUN_TESTS=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --detach|-d)
            DETACH=true
            shift
            ;;
        --test)
            RUN_TESTS=true
            shift
            ;;
        --start)
            shift
            start_all
            ;;
        --stop)
            stop_all
            exit 0
            ;;
        --status)
            show_status
            exit 0
            ;;
        --restart)
            stop_all
            sleep 2
            start_all
            ;;
        --logs)
            shift
            show_logs "$1"
            exit 0
            ;;
        --verify)
            verify_events
            exit 0
            ;;
        --help|-h)
            echo "SSS Token Backend - Localnet Testing Script"
            echo ""
            echo "Usage: $0 [command] [options]"
            echo ""
            echo "Commands:"
            echo "  (default)     Start all services for localnet testing"
            echo "  --start       Start all services"
            echo "  --stop        Stop all services"
            echo "  --status      Show service status"
            echo "  --restart     Restart all services"
            echo "  --test        Run tests after starting"
            echo "  --verify      Verify events were captured"
            echo "  --logs <svc>  Tail logs for a service"
            echo ""
            echo "Options:"
            echo "  --skip-build        Skip building programs and services"
            echo "  --detach, -d        Run in background"
            echo "  --help, -h          Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                      # Start everything"
            echo "  $0 --detach             # Start in background"
            echo "  $0 --test               # Start and run tests"
            echo "  $0 --status             # Check status"
            echo "  $0 --verify             # Check captured events"
            echo "  $0 --logs indexer       # View indexer logs"
            echo "  $0 --stop               # Stop all services"
            echo ""
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            echo "Run '$0 --help' for usage"
            exit 1
            ;;
    esac
done

# Default: start all services
start_all