#!/bin/bash

# ============================================
# SSS Token Backend - Local Devnet Testing
# ============================================
# This script starts backend services locally
# configured to connect to Solana Devnet

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
BACKEND_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$BACKEND_DIR")"
PID_DIR="$BACKEND_DIR/.pids-devnet"
LOG_DIR="$BACKEND_DIR/.logs-devnet"

# Load existing .env.devnet if it exists (allows persistent configuration)
if [ -f "$BACKEND_DIR/.env.devnet" ]; then
    set -a
    source "$BACKEND_DIR/.env.devnet"
    set +a
fi

# Devnet RPC endpoints (can be overridden via env or .env.devnet file)
SOLANA_RPC_URL="${SOLANA_RPC_URL:-https://api.devnet.solana.com}"
SOLANA_WS_URL="${SOLANA_WS_URL:-wss://api.devnet.solana.com}"
SSS_PROGRAM_ID="${SSS_PROGRAM_ID:-Hf1s4EvjS79S6kcHdKhaZHVQsnsjqMbJgBEFZfaGDPmw}"

# Ensure directories exist
mkdir -p "$PID_DIR" "$LOG_DIR"

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${CYAN}[STEP]${NC} $1"; }

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
    local timeout="${3:-30}"
    
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
# Check Devnet Connectivity
# ============================================

check_devnet() {
    log_step "Checking Solana Devnet connectivity..."
    
    # Try to reach devnet RPC
    local response=$(curl -s -X POST -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
        "$SOLANA_RPC_URL" 2>/dev/null)
    
    if echo "$response" | grep -q '"status":"ok"'; then
        log_success "Connected to Solana Devnet"
        return 0
    else
        log_warning "Devnet RPC response: $response"
        log_warning "Devnet may be slow or unreachable. Continuing anyway..."
        return 0
    fi
}

# ============================================
# Status Command
# ============================================

show_status() {
    echo ""
    echo "========================================"
    echo "  SSS Token Backend - Devnet Status"
    echo "========================================"
    echo ""
    
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
    echo "Ports:"
    echo "  - PostgreSQL:     5432"
    echo "  - Redis:          6379"
    echo "  - Indexer API:    3004"
    echo "  - Mint/Burn API:  3001"
    echo "  - Compliance API: 3002"
    echo "  - Webhook API:    3003"
    echo ""
}

# ============================================
# Stop Command
# ============================================

stop_all() {
    echo ""
    echo "========================================"
    echo "  Stopping All Devnet Services"
    echo "========================================"
    echo ""
    
    # Stop backend services
    stop_process "$PID_DIR/webhook.pid" "Webhook Service"
    stop_process "$PID_DIR/compliance.pid" "Compliance Service"
    stop_process "$PID_DIR/mint-burn.pid" "Mint/Burn Service"
    stop_process "$PID_DIR/indexer-api.pid" "Indexer API"
    stop_process "$PID_DIR/indexer.pid" "Indexer"
    
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
    REDIS_PASSWORD="${REDIS_PASSWORD:-sss_redis_secret}"
    for i in {1..30}; do
        if docker-compose exec -T redis redis-cli -a "$REDIS_PASSWORD" ping 2>/dev/null | grep -q PONG; then
            log_success "Redis is ready"
            break
        fi
        sleep 1
    done
}

# ============================================
# Setup Environment for Devnet
# ============================================

setup_devnet_env() {
    log_step "Setting up devnet environment..."
    
    # Create .env.devnet file for backend
    cat > "$BACKEND_DIR/.env.devnet" << EOF
# ============================================
# SSS Token Backend - Devnet Configuration
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

# Webhook Configuration
WEBHOOK_SECRET=devnet-testing-secret
WEBHOOK_TIMEOUT=30000
WEBHOOK_MAX_RETRIES=5
WEBHOOK_RETRY_BASE_DELAY=1000

# OFAC Configuration (disabled for devnet)
OFAC_API_URL=https://sanctionslist.ofac.treas.gov/api
OFAC_SYNC_INTERVAL=86400000
EOF

    log_success "Created .env.devnet file"
    
    # Also create symlink/copy to .env for services
    cp "$BACKEND_DIR/.env.devnet" "$BACKEND_DIR/.env"
    log_success "Copied to .env"
}

# ============================================
# Build Services
# ============================================

build_services() {
    log_step "Building backend services..."
    cd "$BACKEND_DIR"
    
    # Install dependencies
    pnpm install || npm install
    
    # Build shared package first
    cd "$BACKEND_DIR/packages/shared"
    pnpm run build || npm run build
    
    # Build all packages
    cd "$BACKEND_DIR"
    pnpm run build || npm run build
    
    log_success "Services built"
}

# ============================================
# Start Backend Services
# ============================================

start_backend_services() {
    log_step "Starting backend services..."
    
    # Load environment variables
    if [ -f "$BACKEND_DIR/.env.devnet" ]; then
        log_info "Loading environment from .env.devnet..."
        set -a
        source "$BACKEND_DIR/.env.devnet"
        set +a
    else
        log_error "No .env.devnet file found. Run setup first."
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
        INDEXER_MODE="${INDEXER_MODE:-websocket}" \
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
    
    local healthy=0
    for port in 3001 3002 3003; do
        if curl -s "http://localhost:$port/health" > /dev/null 2>&1; then
            log_success "Service on port $port is healthy"
            ((healthy++))
        else
            log_warning "Service on port $port may not be ready yet (check logs)"
        fi
    done
    
    if [ $healthy -eq 3 ]; then
        log_success "All services are healthy"
    fi
}

# ============================================
# Test Services
# ============================================

test_services() {
    log_step "Testing backend services..."
    
    echo ""
    echo "Testing Mint/Burn Service (Port 3001):"
    echo "--------------------------------------"
    local mint_burn_health=$(curl -s http://localhost:3001/health 2>/dev/null)
    echo "Health: $mint_burn_health"
    
    echo ""
    echo "Testing Compliance Service (Port 3002):"
    echo "---------------------------------------"
    local compliance_health=$(curl -s http://localhost:3002/health 2>/dev/null)
    echo "Health: $compliance_health"
    
    echo ""
    echo "Testing Webhook Service (Port 3003):"
    echo "------------------------------------"
    local webhook_health=$(curl -s http://localhost:3003/health 2>/dev/null)
    echo "Health: $webhook_health"
    
    echo ""
    echo "Testing Solana Devnet Connection:"
    echo "---------------------------------"
    local slot=$(curl -s -X POST -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","id":1,"method":"getSlot"}' \
        "$SOLANA_RPC_URL" 2>/dev/null | jq -r '.result // .error')
    echo "Current slot: $slot"
    
    echo ""
    log_success "Test complete"
}

# ============================================
# Logs Command
# ============================================

show_logs() {
    local service="$1"
    
    if [ -z "$service" ]; then
        echo "Available logs:"
        echo "  - indexer"
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
    echo "  SSS Token Backend - Devnet Testing"
    echo "========================================"
    echo ""
    
    # Check prerequisites
    command -v docker > /dev/null || { log_error "docker not found"; exit 1; }
    command -v docker-compose > /dev/null || command -v docker > /dev/null || { log_error "docker-compose not found"; exit 1; }
    command -v node > /dev/null || { log_error "node not found"; exit 1; }
    command -v pnpm > /dev/null || command -v npm > /dev/null || { log_error "pnpm or npm not found"; exit 1; }
    
    # Check devnet connectivity
    check_devnet
    
    # Start infrastructure (PostgreSQL + Redis)
    start_infrastructure
    
    # Setup environment
    setup_devnet_env
    
    # Build services if needed
    if [ "$SKIP_BUILD" = false ]; then
        build_services
    fi
    
    # Start backend services
    start_backend_services
    
    # Run tests if requested
    if [ "$RUN_TESTS" = true ]; then
        test_services
    fi
    
    echo ""
    echo "========================================"
    log_success "All services are running on Devnet!"
    echo "========================================"
    echo ""
    echo "Configuration:"
    echo "  - Solana RPC:     $SOLANA_RPC_URL"
    echo "  - Program ID:     $SSS_PROGRAM_ID"
    echo ""
    echo "Services:"
    echo "  - Indexer API:    http://localhost:3004"
    echo "  - Mint/Burn API:  http://localhost:3001"
    echo "  - Compliance API: http://localhost:3002"
    echo "  - Webhook API:    http://localhost:3003"
    echo ""
    echo "API Endpoints:"
    echo "  - GET  http://localhost:3004/api/stablecoins        # List stablecoins"
    echo "  - GET  http://localhost:3004/api/events             # List events"
    echo "  - POST http://localhost:3001/api/v1/mint-requests"
    echo "  - POST http://localhost:3001/api/v1/burn-requests"
    echo "  - GET  http://localhost:3002/api/v1/blacklist"
    echo "  - GET  http://localhost:3002/api/v1/screening/check/:address"
    echo "  - GET  http://localhost:3003/api/v1/subscriptions"
    echo ""
    echo "Commands:"
    echo "  $0 --status    Show service status"
    echo "  $0 --stop      Stop all services"
    echo "  $0 --logs svc  View logs"
    echo "  $0 --test      Test all services"
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
        --rpc-url)
            SOLANA_RPC_URL="$2"
            shift 2
            ;;
        --ws-url)
            SOLANA_WS_URL="$2"
            shift 2
            ;;
        --program-id)
            SSS_PROGRAM_ID="$2"
            shift 2
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
        --help|-h)
            echo "SSS Token Backend - Devnet Testing Script"
            echo ""
            echo "Usage: $0 [command] [options]"
            echo ""
            echo "Commands:"
            echo "  (default)     Start all services for devnet testing"
            echo "  --start       Start all services"
            echo "  --stop        Stop all services"
            echo "  --status      Show service status"
            echo "  --restart     Restart all services"
            echo "  --test        Test all services"
            echo "  --logs <svc>  Tail logs for a service"
            echo ""
            echo "Options:"
            echo "  --skip-build        Skip building services"
            echo "  --detach, -d        Run in background"
            echo "  --rpc-url <url>     Solana RPC URL (default: https://api.devnet.solana.com)"
            echo "  --ws-url <url>      Solana WS URL (default: wss://api.devnet.solana.com)"
            echo "  --program-id <id>   SSS Program ID"
            echo "  --help, -h          Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                                # Start everything for devnet"
            echo "  $0 --detach                       # Start in background"
            echo "  $0 --status                       # Check status"
            echo "  $0 --test                         # Start and test services"
            echo "  $0 --logs indexer                 # View indexer logs"
            echo "  $0 --stop                         # Stop all services"
            echo ""
            echo "  # Use custom RPC:"
            echo "  $0 --rpc-url https://my-rpc.example.com"
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