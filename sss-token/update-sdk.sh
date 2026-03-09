#!/bin/bash

# Script to update SDK with the latest program IDL and fix mismatches
# This ensures the SDK always uses the correct program ID

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Default options
CLEAN_LEDGER=false
VERIFY_ONLY=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --clean)
            CLEAN_LEDGER=true
            shift
            ;;
        --verify)
            VERIFY_ONLY=true
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --clean     Clean test ledger after update"
            echo "  --verify    Only verify if SDK is up-to-date (no changes)"
            echo "  --help      Show this help message"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Functions
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

# Change to script directory
cd "$(dirname "$0")"

print_info "Checking SDK synchronization..."

# Get program ID from Rust source
RUST_PROGRAM_ID=$(grep 'declare_id!' programs/sss-token/src/lib.rs | sed 's/.*"\(.*\)".*/\1/')
print_info "Rust program ID: $RUST_PROGRAM_ID"

# Get program ID from IDL
if [ -f "target/idl/sss_token.json" ]; then
    IDL_PROGRAM_ID=$(cat target/idl/sss_token.json | jq -r '.address' 2>/dev/null || echo "")
    print_info "IDL program ID: $IDL_PROGRAM_ID"
else
    print_warning "No IDL found in target/idl/"
    IDL_PROGRAM_ID=""
fi

# Get program ID from SDK IDL
if [ -f "sdk/src/idl.json" ]; then
    SDK_PROGRAM_ID=$(cat sdk/src/idl.json | jq -r '.address' 2>/dev/null || echo "")
    print_info "SDK program ID: $SDK_PROGRAM_ID"
else
    print_warning "No IDL found in sdk/src/"
    SDK_PROGRAM_ID=""
fi

# Get program ID from SDK constants
if [ -f "sdk/src/constants.ts" ]; then
    CONSTANTS_PROGRAM_ID=$(grep 'SSS_TOKEN_PROGRAM_ID' sdk/src/constants.ts | sed 's/.*"\(.*\)".*/\1/' || echo "")
    print_info "Constants program ID: $CONSTANTS_PROGRAM_ID"
else
    print_warning "No constants file found in sdk/src/"
    CONSTANTS_PROGRAM_ID=""
fi

# Check if all match
if [ "$VERIFY_ONLY" = true ]; then
    echo ""
    if [ "$RUST_PROGRAM_ID" = "$IDL_PROGRAM_ID" ] && [ "$IDL_PROGRAM_ID" = "$SDK_PROGRAM_ID" ] && [ "$SDK_PROGRAM_ID" = "$CONSTANTS_PROGRAM_ID" ]; then
        print_success "✓ All program IDs match!"
        echo "  Rust:     $RUST_PROGRAM_ID"
        echo "  IDL:      $IDL_PROGRAM_ID"
        echo "  SDK IDL:  $SDK_PROGRAM_ID"
        echo "  Constants: $CONSTANTS_PROGRAM_ID"
        exit 0
    else
        print_error "✗ Program ID mismatch detected!"
        echo "  Rust:     $RUST_PROGRAM_ID"
        echo "  IDL:      $IDL_PROGRAM_ID"
        echo "  SDK IDL:  $SDK_PROGRAM_ID"
        echo "  Constants: $CONSTANTS_PROGRAM_ID"
        exit 1
    fi
fi

# Rebuild if needed
if [ "$RUST_PROGRAM_ID" != "$IDL_PROGRAM_ID" ] || [ "$IDL_PROGRAM_ID" != "$SDK_PROGRAM_ID" ]; then
    echo ""
    print_info "Program ID mismatch detected. Rebuilding..."
    
    # Rebuild program
    print_info "Building Anchor program..."
    if anchor build; then
        print_success "Build successful"
    else
        print_error "Build failed"
        exit 1
    fi
    
    # Get new IDL program ID
    NEW_IDL_PROGRAM_ID=$(cat target/idl/sss_token.json | jq -r '.address')
    print_info "New IDL program ID: $NEW_IDL_PROGRAM_ID"
    
    # Copy IDL to SDK
    print_info "Copying IDL to SDK..."
    cp target/idl/sss_token.json sdk/src/idl.json
    print_success "IDL copied to sdk/src/idl.json"
    
    # Update constants if needed
    if [ "$NEW_IDL_PROGRAM_ID" != "$CONSTANTS_PROGRAM_ID" ]; then
        print_info "Updating SDK constants..."
        
        # Check if constants file exists
        if [ ! -f "sdk/src/constants.ts" ]; then
            print_error "SDK constants file not found"
            exit 1
        fi
        
        # Update the program ID in constants
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' "s/const SSS_TOKEN_PROGRAM_ID = new PublicKey(\".*\")/const SSS_TOKEN_PROGRAM_ID = new PublicKey(\"$NEW_IDL_PROGRAM_ID\")/" sdk/src/constants.ts
        else
            # Linux
            sed -i "s/const SSS_TOKEN_PROGRAM_ID = new PublicKey(\".*\")/const SSS_TOKEN_PROGRAM_ID = new PublicKey(\"$NEW_IDL_PROGRAM_ID\")/" sdk/src/constants.ts
        fi
        
        print_success "Constants updated to $NEW_IDL_PROGRAM_ID"
    fi
    
    # Clean ledger if requested
    if [ "$CLEAN_LEDGER" = true ]; then
        print_info "Cleaning test ledger..."
        rm -rf sdk/test-ledger/
        print_success "Test ledger cleaned"
    fi
    
    echo ""
    echo -e "${GREEN}========================================${NC}"
    print_success "SDK updated successfully!"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo "Program ID: $NEW_IDL_PROGRAM_ID"
    echo ""
    print_info "You can now run tests with: ./test.sh"
    
else
    echo ""
    print_success "✓ SDK is already up-to-date!"
    echo "Program ID: $RUST_PROGRAM_ID"
fi