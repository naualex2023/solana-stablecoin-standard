#!/bin/bash

# ============================================
# SSS Token Backend - Event Viewer
# ============================================
# Query and display events from PostgreSQL

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Configuration
BACKEND_DIR="$(cd "$(dirname "$0")" && pwd)"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-sss-postgres}"
DB_USER="${POSTGRES_USER:-sss}"
DB_NAME="${POSTGRES_DB:-sss_token}"

# ============================================
# Help
# ============================================

show_help() {
    echo "SSS Token Backend - Event Viewer"
    echo ""
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  list              List recent events (default)"
    echo "  count             Count events by type"
    echo "  type <name>       Filter by instruction type (e.g., CreateStablecoin, Mint)"
    echo "  mint <address>    Filter by mint address"
    echo "  signature <sig>   Show details for a specific transaction"
    echo "  tail              Watch events in real-time (like tail -f)"
    echo "  clear             Delete all events (use with caution!)"
    echo "  export [file]     Export events to JSON file"
    echo ""
    echo "Options:"
    echo "  -n, --limit N     Limit results to N rows (default: 20)"
    echo "  -a, --all         Show all results (no limit)"
    echo "  -v, --verbose     Show full event data (JSON)"
    echo "  -h, --help        Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                              # List last 20 events"
    echo "  $0 list -n 50                   # List last 50 events"
    echo "  $0 count                        # Count events by type"
    echo "  $0 type CreateStablecoin        # Filter by instruction type"
    echo "  $0 mint 7vVt2...                # Filter by mint address"
    echo "  $0 signature 5xXy...            # Show specific transaction"
    echo "  $0 tail                         # Watch events in real-time"
    echo "  $0 export events.json           # Export to JSON file"
    echo ""
}

# ============================================
# Database Query Function
# ============================================

db_query() {
    local query="$1"
    docker exec -i "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -A -c "$query" 2>/dev/null
}

db_query_table() {
    local query="$1"
    docker exec -i "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "$query" 2>/dev/null
}

db_query_json() {
    local query="$1"
    docker exec -i "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -A -c "$query" 2>/dev/null
}

# ============================================
# Check if PostgreSQL is running
# ============================================

check_postgres() {
    if ! docker ps | grep -q "$POSTGRES_CONTAINER"; then
        echo -e "${RED}Error: PostgreSQL container '$POSTGRES_CONTAINER' is not running${NC}"
        echo ""
        echo "Start it with:"
        echo "  cd sss-token/backend && docker-compose up -d postgres"
        echo ""
        echo "Or start the full devnet stack:"
        echo "  ./start-devnet.sh --detach"
        exit 1
    fi
}

# ============================================
# List Events
# ============================================

list_events() {
    local limit="${1:-20}"
    local verbose="${2:-false}"
    
    echo ""
    echo -e "${BOLD}Recent Events (last $limit)${NC}"
    echo "=========================================="
    echo ""
    
    if [ "$verbose" = true ]; then
        db_query_table "SELECT id, signature, slot, to_char(block_time, 'YYYY-MM-DD HH24:MI:SS') as time, instruction_type, mint_address, data FROM events ORDER BY created_at DESC LIMIT $limit;"
    else
        db_query_table "SELECT id, LEFT(signature, 20) || '...' as signature, slot, to_char(block_time, 'YYYY-MM-DD HH24:MI:SS') as time, instruction_type, LEFT(mint_address, 12) || '...' as mint FROM events ORDER BY created_at DESC LIMIT $limit;"
    fi
    
    echo ""
}

# ============================================
# Count Events by Type
# ============================================

count_events() {
    echo ""
    echo -e "${BOLD}Event Counts by Type${NC}"
    echo "=========================================="
    echo ""
    
    db_query_table "SELECT instruction_type, COUNT(*) as count FROM events GROUP BY instruction_type ORDER BY count DESC;"
    
    echo ""
    echo -e "${CYAN}Total events:$(db_query "SELECT COUNT(*) FROM events;")${NC}"
    echo ""
}

# ============================================
# Filter by Instruction Type
# ============================================

filter_by_type() {
    local type="$1"
    local limit="${2:-20}"
    
    echo ""
    echo -e "${BOLD}Events with type: $type${NC}"
    echo "=========================================="
    echo ""
    
    db_query_table "SELECT id, LEFT(signature, 20) || '...' as signature, slot, to_char(block_time, 'YYYY-MM-DD HH24:MI:SS') as time, LEFT(mint_address, 12) || '...' as mint FROM events WHERE instruction_type ILIKE '%$type%' ORDER BY created_at DESC LIMIT $limit;"
    
    echo ""
    echo -e "${CYAN}Found:$(db_query "SELECT COUNT(*) FROM events WHERE instruction_type ILIKE '%$type%';")${NC}"
    echo ""
}

# ============================================
# Filter by Mint Address
# ============================================

filter_by_mint() {
    local mint="$1"
    local limit="${2:-20}"
    
    echo ""
    echo -e "${BOLD}Events for mint: $mint${NC}"
    echo "=========================================="
    echo ""
    
    db_query_table "SELECT id, LEFT(signature, 20) || '...' as signature, slot, to_char(block_time, 'YYYY-MM-DD HH24:MI:SS') as time, instruction_type FROM events WHERE mint_address ILIKE '%$mint%' ORDER BY created_at DESC LIMIT $limit;"
    
    echo ""
    echo -e "${CYAN}Found:$(db_query "SELECT COUNT(*) FROM events WHERE mint_address ILIKE '%$mint%';")${NC}"
    echo ""
}

# ============================================
# Show Transaction Details
# ============================================

show_signature() {
    local sig="$1"
    
    echo ""
    echo -e "${BOLD}Transaction Details${NC}"
    echo "=========================================="
    echo ""
    
    local result=$(db_query_json "
        SELECT json_build_object(
            'id', id,
            'signature', signature,
            'slot', slot,
            'block_time', block_time,
            'instruction_type', instruction_type,
            'mint_address', mint_address,
            'data', data,
            'created_at', created_at
        ) FROM events WHERE signature ILIKE '%$sig%';
    ")
    
    if [ -z "$result" ] || [ "$result" = "null" ]; then
        echo -e "${RED}No event found with signature containing: $sig${NC}"
        exit 1
    fi
    
    echo "$result" | jq '.' 2>/dev/null || echo "$result"
    echo ""
}

# ============================================
# Tail Events (Real-time)
# ============================================

tail_events() {
    echo ""
    echo -e "${BOLD}Watching for new events (press Ctrl+C to stop)...${NC}"
    echo "=========================================="
    echo ""
    
    local last_id=0
    
    # Get current max id
    last_id=$(db_query "SELECT COALESCE(MAX(id), 0) FROM events;")
    
    while true; do
        local new_events=$(db_query "
            SELECT id, signature, instruction_type, mint_address 
            FROM events 
            WHERE id > $last_id 
            ORDER BY id ASC;
        ")
        
        if [ -n "$new_events" ]; then
            while IFS='|' read -r id sig type mint; do
                echo -e "${GREEN}[NEW]${NC} $(date '+%H:%M:%S') | ${CYAN}$type${NC} | mint: ${mint:0:12)}... | sig: ${sig:0:20)}..."
                last_id=$id
            done <<< "$new_events"
        fi
        
        sleep 1
    done
}

# ============================================
# Clear Events
# ============================================

clear_events() {
    echo ""
    echo -e "${RED}WARNING: This will delete ALL events!${NC}"
    echo ""
    read -p "Are you sure? (yes/no): " confirm
    
    if [ "$confirm" = "yes" ]; then
        db_query "TRUNCATE TABLE events RESTART IDENTITY CASCADE;"
        echo -e "${GREEN}All events deleted.${NC}"
    else
        echo "Cancelled."
    fi
}

# ============================================
# Export Events
# ============================================

export_events() {
    local file="${1:-events_export_$(date +%Y%m%d_%H%M%S).json}"
    
    echo ""
    echo -e "${BOLD}Exporting events to $file...${NC}"
    
    local json=$(db_query_json "
        SELECT json_agg(
            json_build_object(
                'id', id,
                'signature', signature,
                'slot', slot,
                'block_time', block_time,
                'instruction_type', instruction_type,
                'mint_address', mint_address,
                'data', data,
                'created_at', created_at
            )
        ) FROM events;
    ")
    
    echo "$json" | jq '.' > "$file" 2>/dev/null
    
    local count=$(echo "$json" | jq 'length' 2>/dev/null || echo "0")
    
    echo -e "${GREEN}Exported $count events to $file${NC}"
    echo ""
}

# ============================================
# Parse Arguments
# ============================================

COMMAND="list"
LIMIT=20
VERBOSE=false
FILTER_VALUE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -n|--limit)
            LIMIT="$2"
            shift 2
            ;;
        -a|--all)
            LIMIT=10000
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        list)
            COMMAND="list"
            shift
            ;;
        count)
            COMMAND="count"
            shift
            ;;
        type)
            COMMAND="type"
            FILTER_VALUE="$2"
            shift 2
            ;;
        mint)
            COMMAND="mint"
            FILTER_VALUE="$2"
            shift 2
            ;;
        signature|sig)
            COMMAND="signature"
            FILTER_VALUE="$2"
            shift 2
            ;;
        tail|watch)
            COMMAND="tail"
            shift
            ;;
        clear)
            COMMAND="clear"
            shift
            ;;
        export)
            COMMAND="export"
            FILTER_VALUE="$2"
            shift 2 || shift
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Run '$0 --help' for usage"
            exit 1
            ;;
    esac
done

# ============================================
# Execute Command
# ============================================

check_postgres

case $COMMAND in
    list)
        list_events "$LIMIT" "$VERBOSE"
        ;;
    count)
        count_events
        ;;
    type)
        if [ -z "$FILTER_VALUE" ]; then
            echo -e "${RED}Error: Please specify an instruction type${NC}"
            echo "Example: $0 type CreateStablecoin"
            exit 1
        fi
        filter_by_type "$FILTER_VALUE" "$LIMIT"
        ;;
    mint)
        if [ -z "$FILTER_VALUE" ]; then
            echo -e "${RED}Error: Please specify a mint address${NC}"
            echo "Example: $0 mint 7vVt2..."
            exit 1
        fi
        filter_by_mint "$FILTER_VALUE" "$LIMIT"
        ;;
    signature)
        if [ -z "$FILTER_VALUE" ]; then
            echo -e "${RED}Error: Please specify a signature${NC}"
            echo "Example: $0 signature 5xXy..."
            exit 1
        fi
        show_signature "$FILTER_VALUE"
        ;;
    tail)
        tail_events
        ;;
    clear)
        clear_events
        ;;
    export)
        export_events "$FILTER_VALUE"
        ;;
esac