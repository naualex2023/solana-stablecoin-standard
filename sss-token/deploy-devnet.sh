#!/bin/bash

# SSS Token Devnet Deployment Script
# This script deploys the SSS Token and Transfer Hook programs to Solana devnet

set -e

echo "=============================================="
echo "SSS Token Devnet Deployment"
echo "=============================================="

# Wallet configuration
WALLET_FILE="./admin_phantom_key_pc.json"

# Check if wallet file exists
if [ ! -f "$WALLET_FILE" ]; then
    echo "ERROR: Wallet file not found: $WALLET_FILE"
    echo "Please ensure your wallet keyfile exists at the specified path."
    exit 1
fi

# Get wallet address
WALLET_ADDRESS=$(solana-keygen pubkey $WALLET_FILE)
echo ""
echo "Using wallet: $WALLET_ADDRESS"

# Set environment variables
export ANCHOR_WALLET=$WALLET_FILE
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com

# Set Solana config to devnet with our wallet
echo ""
echo "Configuring Solana CLI for devnet..."
solana config set --url devnet --keypair $WALLET_FILE

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