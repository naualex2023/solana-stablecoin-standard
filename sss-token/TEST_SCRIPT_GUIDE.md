# Test Script Guide

## Overview

The `test.sh` script provides a fully automated testing workflow for the SSS Token SDK. It handles all the tedious setup work so you can focus on development.

## What the Script Does

The script automates the complete testing workflow:

1. **Starts local validator** - Spawns `solana-test-validator` in the background
2. **Requests airdrop** - Ensures sufficient SOL balance for transactions
3. **Builds programs** - Compiles Anchor programs with `anchor build`
4. **Deploys programs** - Deploys sss-token (and transfer-hook) to localnet
5. **Runs SDK tests** - Executes the TypeScript test suite
6. **Cleanup** - Stops validator and cleans up (optional)

## Usage

### Basic Usage

Run with all default settings:

```bash
cd sss-token
./test.sh
```

This will:
- Start validator
- Build and deploy programs
- Run all tests
- Stop validator when complete

### Command Line Options

```bash
./test.sh [OPTIONS]
```

**Available Options:**

- `--clean` - Clean existing ledger and start fresh validator
  - Useful when you want a pristine test environment
  - Removes old test data and starts from scratch

- `--skip-deploy` - Skip program deployment
  - Use when program is already deployed
  - Saves time during iterative testing

- `--no-stop` - Keep validator running after tests
  - Useful for manual testing or debugging
  - You'll need to manually stop the validator later

- `--help` - Show help message and exit

### Examples

**Start with a fresh ledger:**
```bash
./test.sh --clean
```

**Run tests without redeploying:**
```bash
./test.sh --skip-deploy
```

**Keep validator running for manual testing:**
```bash
./test.sh --no-stop
```

**Combined options:**
```bash
./test.sh --clean --no-stop
```

## Workflow Details

### 1. Validator Management

The script intelligently handles validator lifecycle:

- **Check if running** - Detects if `solana-test-validator` is already running
- **Reuse if exists** - Won't start a new validator if one is running
- **Start if needed** - Starts a new validator in the background
- **Wait for ready** - Waits up to 30 seconds for validator to be responsive
- **Logs** - Validator output is saved to `test-logs/validator.log`

**Ledger persistence:**
- Ledger is stored in `sdk/test-ledger/`
- Persists between test runs (unless `--clean` is used)
- Speeds up subsequent test runs

### 2. Balance Management

The script ensures your wallet has enough SOL:

- **Checks current balance** - Queries wallet SOL balance
- **Threshold** - Requires minimum 2 SOL
- **Airdrops if needed** - Requests airdrop of 2 SOL if below threshold
- **Note**: Airdrops may fail on localnet (normal behavior)

### 3. Program Deployment

Automatically builds and deploys both programs:

- **Build step**: Runs `anchor build` for all programs
- **Deploy sss-token**: Deploys main stablecoin program
- **Deploy transfer-hook**: Deploys transfer-hook program (if present)
- **Skip option**: Use `--skip-deploy` to skip this step

### 4. Test Execution

Runs the TypeScript SDK test suite:

- **Changes to sdk directory**
- **Executes**: `npm test`
- **Reports**: Pass/fail status with colored output
- **Timeout**: Tests have 10-second timeout per test

### 5. Cleanup

Cleans up resources after tests:

- **Default behavior**: Stops validator
- **With `--no-stop`**: Leaves validator running
- **Graceful shutdown**: Attempts clean kill first
- **Force kill**: Falls back to force kill if needed

## Troubleshooting

### Validator Won't Start

**Symptom**: "Validator failed to start within 30 seconds"

**Solutions**:
1. Check if port 8899 is already in use:
   ```bash
   lsof -i :8899
   ```
2. Kill existing validator:
   ```bash
   pkill -f solana-test-validator
   ```
3. Clean ledger:
   ```bash
   ./test.sh --clean
   ```

### Tests Fail with "Program does not exist"

**Symptom**: All tests fail with "Attempt to load a program that does not exist"

**Cause**: Program not deployed

**Solution**: Run without `--skip-deploy` flag:
```bash
./test.sh
```

### Airdrop Fails

**Symptom**: "Airdrop failed (this is normal on localnet)"

**Cause**: Localnet doesn't support airdrops

**Solutions**:
1. Ignore the warning (tests may still work)
2. Manually fund your wallet:
   ```bash
   solana transfer <wallet-address> 2
   ```
3. Use devnet instead (modify test to use devnet RPC)

### Tests Timeout

**Symptom**: Tests hang or timeout

**Solutions**:
1. Check validator logs:
   ```bash
   cat test-logs/validator.log
   ```
2. Ensure validator is running:
   ```bash
   solana cluster-version
   ```
3. Increase timeout in `sdk/package.json`:
   ```json
   "test": "ts-mocha tests/**/*.test.ts --timeout 20000"
   ```

### Permission Denied

**Symptom**: `bash: ./test.sh: Permission denied`

**Solution**: Make script executable:
```bash
chmod +x test.sh
```

## Advanced Usage

### Manual Validator Management

If you prefer manual control:

```bash
# Start validator manually
solana-test-validator --ledger sdk/test-ledger

# In another terminal, deploy
anchor build
anchor deploy --program-name sss_token

# Run tests
cd sdk
npm test
```

### Testing on Devnet

To test on devnet instead of localnet:

1. Configure Solana CLI for devnet:
   ```bash
   solana config set --url devnet
   ```

2. Request airdrop:
   ```bash
   solana airdrop 2
   ```

3. Deploy to devnet:
   ```bash
   anchor deploy --provider.cluster devnet
   ```

4. Run tests with devnet URL:
   ```bash
   cd sdk
   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com npm test
   ```

### Continuous Development

For rapid iteration:

```bash
# Terminal 1: Start validator once
./test.sh --no-stop

# Terminal 2: Make code changes, then run tests repeatedly
cd sdk
npm test
# or from root with skip-deploy
../test.sh --skip-deploy --no-stop
```

## Integration with CI/CD

The script is designed to work in CI/CD environments:

```yaml
# Example GitHub Actions workflow
- name: Install Solana
  uses: metaplex-foundation/solana-action@v1

- name: Run tests
  run: |
    cd sss-token
    ./test.sh --clean
```

## File Structure

```
sss-token/
├── test.sh              # Main test script
├── test-logs/           # Validator and test logs
│   └── validator.log
├── sdk/
│   ├── test-ledger/      # Persistent test ledger
│   └── tests/           # TypeScript test suite
└── programs/            # Anchor programs
```

## Best Practices

1. **Use `--clean` for first run** - Ensures clean state
2. **Use `--skip-deploy` for iteration** - Saves time during development
3. **Use `--no-stop` for debugging** - Keeps validator available for inspection
4. **Check logs when tests fail** - `test-logs/validator.log` has details
5. **Kill stuck validators** - `pkill -f solana-test-validator`

## Support

If you encounter issues:

1. Check this guide's troubleshooting section
2. Review `test-logs/validator.log`
3. Ensure all dependencies are installed:
   - Solana CLI
   - Anchor
   - Node.js and npm
4. Run with `--clean` to reset state

## Summary

The `test.sh` script provides a complete, automated testing workflow that:

✅ Eliminates manual setup steps
✅ Handles validator lifecycle
✅ Manages program deployment
✅ Provides clear, colored output
✅ Offers flexible options for different use cases
✅ Includes comprehensive error handling

It's the recommended way to test the SSS Token SDK!