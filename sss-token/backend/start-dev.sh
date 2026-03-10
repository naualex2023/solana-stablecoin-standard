#!/bin/bash

# SSS Token Backend Services Development Script
# Starts all services and keeps them running for interactive testing

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
PID_DIR="$BACKEND_DIR/.pids"
LOG_DIR="$BACKEND_DIR/.logs"
VALIDATOR_PORT=8899

# Ensure PID and LOG directories exist
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
# Status Command
# ============================================

show_status() {
    echo ""
    echo "========================================"
    echo "  SSS Token Backend Services Status"
    echo "========================================"
    echo ""
    
    # Validator
    if is_running "$PID_DIR/validator.pid"; then
        echo -e "Solana Validator:  ${GREEN}RUNNING${NC} (PID: $(cat $PID_DIR/validator.pid))"
    else
        echo -e "Solana Validator:  ${RED}STOPPED${NC}"
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
    for service in indexer mint-burn compliance webhook; do
        if is_running "$PID_DIR/$service.pid"; then
            echo -e "$(echo $service | sed 's/.*/\u&'):        ${GREEN}RUNNING${NC} (PID: $(cat $PID_DIR/$service.pid))"
        else
            echo -e "$(echo $service | sed 's/.*/\u&'):        ${RED}STOPPED${NC}"
        fi
    done
    
    echo ""
    echo "Ports:"
    echo "  - Solana RPC:     8899"
    echo "  - Solana WS:      8900"
    echo "  - PostgreSQL:     5432"
    echo "  - Redis:          6379"
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
    echo "  Stopping All Services"
    echo "========================================"
    echo ""
    
    # Stop backend services
    stop_process "$PID_DIR/webhook.pid" "Webhook Service"
    stop_process "$PID_DIR/compliance.pid" "Compliance Service"
    stop_process "$PID_DIR/mint-burn.pid" "Mint/Burn Service"
    stop_process "$PID_DIR/indexer.pid" "Indexer"
    
    # Stop validator
    stop_process "$PID_DIR/validator.pid" "Solana Validator"
    
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
# Start Validator
# ============================================

start_validator() {
    log_step "Starting Solana validator..."
    
    if is_running "$PID_DIR/validator.pid"; then
        log_warning "Validator already running (PID: $(cat $PID_DIR/validator.pid))"
        return 0
    fi
    
    cd "$PROJECT_ROOT"
    
    if [ -d "sdk/test-ledger" ]; then
        log_info "Using existing test-ledger..."
        solana-test-validator --ledger sdk/test-ledger --reset > "$LOG_DIR/validator.log" 2>&1 &
    else
        log_info "Starting fresh validator..."
        solana-test-validator > "$LOG_DIR/validator.log" 2>&1 &
    fi
    
    echo $! > "$PID_DIR/validator.pid"
    
    wait_for_port 8899 "Solana Validator" 60
}

# ============================================
# Start Infrastructure
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
        if docker-compose exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then
            log_success "Redis is ready"
            break
        fi
        sleep 1
    done
}

# ============================================
# Start Backend Services
# ============================================

start_backend_services() {
    log_step "Starting backend services..."
    
    # Indexer
    if is_running "$PID_DIR/indexer.pid"; then
        log_warning "Indexer already running"
    else
        log_info "Starting Indexer..."
        cd "$BACKEND_DIR/packages/indexer"
        pnpm dev > "$LOG_DIR/indexer.log" 2>&1 &
        echo $! > "$PID_DIR/indexer.pid"
        sleep 2
    fi
    
    # Mint/Burn Service
    if is_running "$PID_DIR/mint-burn.pid"; then
        log_warning "Mint/Burn service already running"
    else
        log_info "Starting Mint/Burn Service..."
        cd "$BACKEND_DIR/packages/mint-burn-service"
        PORT=3001 pnpm dev > "$LOG_DIR/mint-burn.log" 2>&1 &
        echo $! > "$PID_DIR/mint-burn.pid"
        sleep 2
    fi
    
    # Compliance Service
    if is_running "$PID_DIR/compliance.pid"; then
        log_warning "Compliance service already running"
    else
        log_info "Starting Compliance Service..."
        cd "$BACKEND_DIR/packages/compliance-service"
        PORT=3002 pnpm dev > "$LOG_DIR/compliance.log" 2>&1 &
        echo $! > "$PID_DIR/compliance.pid"
        sleep 2
    fi
    
    # Webhook Service
    if is_running "$PID_DIR/webhook.pid"; then
        log_warning "Webhook service already running"
    else
        log_info "Starting Webhook Service..."
        cd "$BACKEND_DIR/packages/webhook-service"
        PORT=3003 pnpm dev > "$LOG_DIR/webhook.log" 2>&1 &
        echo $! > "$PID_DIR/webhook.pid"
        sleep 2
    fi
    
    # Health checks
    log_info "Checking service health..."
    sleep 3
    
    for port in 3001 3002 3003; do
        if curl -s "http://localhost:$port/health" > /dev/null 2>&1; then
            log_success "Service on port $port is healthy"
        else
            log_warning "Service on port $port may not be ready yet"
        fi
    done
}

# ============================================
# Setup Environment
# ============================================

setup_environment() {
    log_step "Setting up environment..."
    cd "$BACKEND_DIR"
    
    if [ ! -f ".env" ]; then
        log_info "Creating .env file..."
        
        PROGRAM_ID=$(cat "$PROJECT_ROOT/target/idl/sss_token.json" 2>/dev/null | grep -o '"address": *"[^"]*"' | head -1 | cut -d'"' -f4 || echo "Hf1s4EvjS79S6kcHdKhaZHVQsnsjqMbJgBEFZfaGDPmw")
        
        cat > .env << EOF
# Solana Configuration
SOLANA_RPC_URL=http://localhost:8899
SOLANA_WS_URL=ws://localhost:8900
SSS_PROGRAM_ID=$PROGRAM_ID
COMMITMENT=confirmed

# Database Configuration
DATABASE_URL=postgresql://sss:sss_secret@localhost:5432/sss_token

# Redis Configuration
REDIS_URL=redis://:sss_redis_secret@localhost:6379

# Service Ports
MINT_BURN_PORT=3001
COMPLIANCE_PORT=3002
WEBHOOK_PORT=3003

# Logging
LOG_LEVEL=debug
NODE_ENV=development

# Webhook Configuration
WEBHOOK_SECRET=local-dev-secret
MAX_RETRIES=5
EOF
        
        log_success ".env file created"
    else
        log_info ".env file already exists"
    fi
}

# ============================================
# Build Steps
# ============================================

build_programs() {
    log_step "Building Solana programs..."
    cd "$PROJECT_ROOT"
    anchor build
    log_success "Programs built"
}

deploy_programs() {
    log_step "Deploying programs to localnet..."
    cd "$PROJECT_ROOT"
    solana config set --url localhost
    anchor deploy
    log_success "Programs deployed"
}

build_services() {
    log_step "Building backend services..."
    cd "$BACKEND_DIR"
    pnpm install
    pnpm build
    log_success "Services built"
}

# ============================================
# Logs Command
# ============================================

show_logs() {
    local service="$1"
    
    if [ -z "$service" ]; then
        echo "Available logs:"
        echo "  - validator"
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
    echo "  SSS Token Backend Development Mode"
    echo "========================================"
    echo ""
    
    # Check prerequisites
    command -v solana > /dev/null || { log_error "solana CLI not found"; exit 1; }
    command -v anchor > /dev/null || { log_error "anchor CLI not found"; exit 1; }
    command -v pnpm > /dev/null || { log_error "pnpm not found"; exit 1; }
    command -v docker > /dev/null || { log_error "docker not found"; exit 1; }
    
    # Build if needed
    if [ "$SKIP_BUILD" = false ]; then
        build_programs
    fi
    
    # Start validator
    start_validator
    
    # Deploy if needed
    if [ "$SKIP_DEPLOY" = false ]; then
        deploy_programs
    fi
    
    # Start infrastructure
    start_infrastructure
    
    # Setup environment
    setup_environment
    
    # Build services if needed
    if [ "$SKIP_BUILD" = false ]; then
        build_services
    fi
    
    # Start backend services
    start_backend_services
    
    echo ""
    echo "========================================"
    log_success "All services are running!"
    echo "========================================"
    echo ""
    echo "Services:"
    echo "  - Solana RPC:     http://localhost:8899"
    echo "  - Mint/Burn API:  http://localhost:3001"
    echo "  - Compliance API: http://localhost:3002"
    echo "  - Webhook API:    http://localhost:3003"
    echo ""
    echo "Commands:"
    echo "  $0 --status    Show service status"
    echo "  $0 --stop      Stop all services"
    echo "  $0 --logs svc  View logs (validator, indexer, mint-burn, compliance, webhook)"
    echo "  $0 --restart   Restart all services"
    echo ""
    echo "Log files: $LOG_DIR"
    echo "PID files: $PID_DIR"
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
SKIP_DEPLOY=false
DETACH=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --skip-deploy)
            SKIP_DEPLOY=true
            shift
            ;;
        --detach|-d)
            DETACH=true
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
        --help|-h)
            echo "SSS Token Backend Development Script"
            echo ""
            echo "Usage: $0 [command] [options]"
            echo ""
            echo "Commands:"
            echo "  (default)     Start all services (interactive mode)"
            echo "  --start       Start all services"
            echo "  --stop        Stop all services"
            echo "  --status      Show service status"
            echo "  --restart     Restart all services"
            echo "  --logs <svc>  Tail logs for a service"
            echo ""
            echo "Options:"
            echo "  --skip-build    Skip building programs and services"
            echo "  --skip-deploy   Skip deploying programs"
            echo "  --detach, -d    Run in background (don't wait for Ctrl+C)"
            echo "  --help, -h      Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                      # Start everything interactively"
            echo "  $0 --detach             # Start everything in background"
            echo "  $0 --status             # Check if services are running"
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