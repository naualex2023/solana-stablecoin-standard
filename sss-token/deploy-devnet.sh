#!/bin/bash

# SSS Token Devnet Deployment Script
# This script deploys the SSS Token and Transfer Hook programs to Solana devnet

set -e

echo "=============================================="
echo "SSS Token Devnet Deployment"
echo "=============================================="

# Load environment variables
export $(cat .env.devnet | grep -v '^#' | xargs)

# Check if wallet file exists
if [ ! -f "$ANCHOR_WALLET" ]; then
    echo "ERROR: Wallet file not found: $ANCHOR_WALLET"
    echo "Please ensure your wallet keyfile exists at the specified path."
    exit 1
fi

# Set Solana config to devnet
echo ""
echo "Configuring Solana CLI for devnet..."
solana config set --url devnet

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
anchor build --provider.cluster devnet

# Deploy programs
echo ""
echo "Deploying SSS Token program..."
anchor deploy --provider.cluster devnet --program-name sss-token

echo ""
echo "Deploying Transfer Hook program..."
anchor deploy --provider.cluster devnet --program-name transfer-hook

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