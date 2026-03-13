#!/bin/bash

# SSS Token Test Environment Setup Script
# 
# This script sets up a complete testing environment for the SSS Token frontend.
# It generates keypairs, creates a stablecoin, and saves everything for testing.
#
# Prerequisites:
#   - Local Solana validator running (solana-test-validator)
#   - SSS Token program deployed
#   - SDK built (cd sdk && npm run build)
#
# Usage:
#   ./scripts/setup-test-env.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "=============================================="
echo "   SSS Token Test Environment Setup"
echo "=============================================="
echo -e "${NC}"

# Check if we're in the sss-token directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: Please run this script from the sss-token directory${NC}"
    exit 1
fi

# Check if SDK is built
if [ ! -f "sdk/dist/index.js" ]; then
    echo -e "${YELLOW}SDK not built. Building SDK...${NC}"
    cd sdk && npm run build && cd ..
    echo -e "${GREEN}SDK built successfully${NC}"
fi

# Check if local validator is running
echo -e "${BLUE}Checking if local validator is running...${NC}"
if ! solana cluster-version &> /dev/null; then
    echo -e "${YELLOW}Local validator not detected.${NC}"
    echo -e "${YELLOW}Please start a local validator in another terminal:${NC}"
    echo -e "  ${BLUE}solana-test-validator --reset${NC}"
    echo ""
    echo -e "${YELLOW}Or with the SSS program loaded:${NC}"
    echo -e "  ${BLUE}solana-test-validator --reset --bpf-program sssToken1111111111111111111111111111111111rQ target/deploy/sss_token.so${NC}"
    echo ""
    read -p "Press Enter once the validator is running..."
fi

# Set Solana config to localnet
echo -e "${BLUE}Setting Solana config to localhost...${NC}"
solana config set --url localhost

# Run the setup script
echo -e "${BLUE}Running setup script...${NC}"
echo ""

cd sss-token 2>/dev/null || true
npx ts-node scripts/setup-test-wallets.ts

# Check if setup was successful
if [ -f "scripts/test-wallets/config.json" ]; then
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}   Setup Complete!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "📁 Keypair files are in: ${BLUE}scripts/test-wallets/${NC}"
    echo ""
    echo -e "🔐 To import wallets into Phantom/Solflare:"
    echo -e "   1. Open wallet settings"
    echo -e "   2. Import existing wallet"
    echo -e "   3. Copy the private key from JSON file"
    echo ""
    echo -e "🌐 To test the frontend:"
    echo -e "   ${BLUE}cd frontend && npm run dev${NC}"
    echo -e "   Then open ${BLUE}http://localhost:3000/admin${NC}"
    echo ""
    
    # Show config summary
    echo -e "📋 Test Configuration:"
    cat scripts/test-wallets/config.json | head -20
else
    echo -e "${RED}Setup failed. Check the error messages above.${NC}"
    exit 1
fi