#!/bin/bash

# SSS Token Devnet Test Runner
# Runs comprehensive tests against devnet and generates proof documentation

set -e

echo "=============================================="
echo "SSS Token Devnet Test Runner"
echo "=============================================="

# Wallet configuration (use default Solana wallet)
WALLET_FILE="$HOME/.config/solana/id.json"

# Check if wallet file exists
if [ ! -f "$WALLET_FILE" ]; then
    echo "ERROR: Wallet file not found: $WALLET_FILE"
    echo "Please ensure your wallet keyfile exists at the specified path."
    exit 1
fi

# Get wallet address
WALLET_ADDRESS=$(solana-keygen pubkey $WALLET_FILE)
echo ""
echo "Wallet: $WALLET_ADDRESS"

# Check balance
echo ""
echo "Checking balance on devnet..."
BALANCE=$(solana balance --url devnet $WALLET_ADDRESS 2>/dev/null || echo "0 SOL")
echo "Balance: $BALANCE"

# Warn if balance is low
BALANCE_NUM=$(echo $BALANCE | awk '{print $1}')
if (( $(echo "$BALANCE_NUM < 0.5" | bc -l) )); then
    echo ""
    echo "⚠️  WARNING: Low balance! Tests require at least 0.5 SOL."
    echo ""
    echo "Request airdrop:"
    echo "  solana airdrop 2 $WALLET_ADDRESS --url devnet"
    echo ""
    echo "Or use the faucet: https://faucet.solana.com/"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Run tests
echo ""
echo "=============================================="
echo "Running Devnet Tests..."
echo "=============================================="
echo ""
echo "This will execute 16 test scenarios covering all SSS Token operations."
echo "Each test generates a transaction signature for proof."
echo ""

# Set environment for devnet
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com

# Run the devnet tests
npm run test-devnet 2>&1 | tee devnet-test-output.log

# Check if proof was generated
if [ -f "DEVNET_PROOF.md" ]; then
    echo ""
    echo "=============================================="
    echo "Test Complete!"
    echo "=============================================="
    echo ""
    echo "📄 Proof documentation: DEVNET_PROOF.md"
    echo "📋 Test output log: devnet-test-output.log"
    echo ""
    echo "View proof:"
    echo "  cat DEVNET_PROOF.md"
    echo ""
else
    echo ""
    echo "⚠️  Tests completed but no proof was generated."
    echo "Check devnet-test-output.log for details."
fi