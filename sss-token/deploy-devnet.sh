#!/bin/bash

# SSS Token Devnet Deployment Script
# This script deploys the SSS Token and Transfer Hook programs to Solana devnet
# Uses the original deployer wallet (id.json) for program upgrades

set -e

echo "=============================================="
echo "SSS Token Devnet Deployment"
echo "=============================================="

# Deployment wallet (original authority for existing programs)
DEPLOY_WALLET="$HOME/.config/solana/id.json"

# Test wallet (your Phantom wallet)
TEST_WALLET="./admin_phantom_key_pc.json"

# Check if deploy wallet exists
if [ ! -f "$DEPLOY_WALLET" ]; then
    echo "ERROR: Deploy wallet not found: $DEPLOY_WALLET"
    exit 1
fi

# Get wallet addresses
DEPLOY_ADDRESS=$(solana-keygen pubkey $DEPLOY_WALLET)
TEST_ADDRESS=$(solana-keygen pubkey $TEST_WALLET 2>/dev/null || echo "N/A")

echo ""
echo "Deploy wallet: $DEPLOY_ADDRESS"
echo "Test wallet: $TEST_ADDRESS"

# Set environment variables for deployment
export ANCHOR_WALLET=$DEPLOY_WALLET
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com

# Set Solana config to devnet with deploy wallet
echo ""
echo "Configuring Solana CLI for devnet..."
solana config set --url devnet --keypair $DEPLOY_WALLET

# Check balance
echo ""
echo "Checking wallet balance..."
BALANCE=$(solana balance --url devnet)
echo "Balance: $BALANCE"

# Warn if balance is low
BALANCE_NUM=$(echo $BALANCE | awk '{print $1}')
if (( $(echo "$BALANCE_NUM < 2" | bc -l) )); then
    echo ""
    echo "WARNING: Low balance. You may need more SOL for deployment."
    echo "Request airdrop with: solana airdrop 2 <YOUR_ADDRESS> --url devnet"
    echo "Or use the faucet at: https://faucet.solana.com/"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Build programs
echo ""
echo "Building programs for devnet..."
echo "This may take a few minutes..."
anchor build --provider.cluster devnet --provider.wallet $DEPLOY_WALLET

# Deploy programs
echo ""
echo "Deploying SSS Token program..."
anchor deploy --provider.cluster devnet --provider.wallet $DEPLOY_WALLET --program-name sss-token || {
    echo ""
    echo "⚠️  SSS Token deployment failed."
    echo "   Check if you have sufficient SOL and the correct authority."
    echo ""
}

echo ""
echo "Deploying Transfer Hook program..."
anchor deploy --provider.cluster devnet --provider.wallet $DEPLOY_WALLET --program-name transfer-hook || {
    echo ""
    echo "⚠️  Transfer Hook deployment failed."
    echo "   Check if you have sufficient SOL and the correct authority."
    echo ""
}

# Get program IDs
SSS_TOKEN_ID=$(cat target/deploy/sss_token-keypair.json | solana-keygen pubkey)
TRANSFER_HOOK_ID=$(cat target/deploy/transfer_hook-keypair.json | solana-keygen pubkey)

echo ""
echo "=============================================="
echo "Deployment Complete!"
echo "=============================================="
echo ""
echo "SSS Token Program: $SSS_TOKEN_ID"
echo "Transfer Hook Program: $TRANSFER_HOOK_ID"
echo ""
echo "View on Solana Explorer:"
echo "https://explorer.solana.com/address/$SSS_TOKEN_ID?cluster=devnet"
echo "https://explorer.solana.com/address/$TRANSFER_HOOK_ID?cluster=devnet"
echo ""
echo "Next steps:"
echo "1. Run tests: npm run test-devnet"
echo "2. View proof: cat DEVNET_PROOF.md"
echo ""