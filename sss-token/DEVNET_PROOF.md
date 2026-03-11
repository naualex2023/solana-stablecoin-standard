# SSS Token Devnet Proof of Transactions

**Status:** Pending - Run `./test-devnet.sh` to generate proof

**Network:** Devnet

---

## Program Information

| Program | Address | Explorer Link |
|---------|---------|---------------|
| SSS Token | `Hf1s4EvjS79S6kcHdKhaZHVQsnsjqMbJgBEFZfaGDPmw` | [View](https://explorer.solana.com/address/Hf1s4EvjS79S6kcHdKhaZHVQsnsjqMbJgBEFZfaGDPmw?cluster=devnet) |
| Transfer Hook | `az3oVrACpVrCJbgGhKueYhTWobmte2AwYgMp1cAzdKD` | [View](https://explorer.solana.com/address/az3oVrACpVrCJbgGhKueYhTWobmte2AwYgMp1cAzdKD?cluster=devnet) |

---

## How to Generate Proof

1. **Fund your wallet:**
   ```bash
   # Check your wallet address
   solana-keygen pubkey ./admin_phantom_key_pc.json
   
   # Request airdrop (use faucet if needed)
   solana airdrop 2 <YOUR_ADDRESS> --url devnet
   # Or visit: https://faucet.solana.com/
   ```

2. **Deploy programs (if not already deployed):**
   ```bash
   ./deploy-devnet.sh
   ```

3. **Run tests and generate proof:**
   ```bash
   chmod +x *.sh
   ./test-devnet.sh
   ```

4. **View generated proof:**
   ```bash
   cat DEVNET_PROOF.md
   ```

---

## Test Coverage

| # | Test | Description |
|---|------|-------------|
| 1 | Initialize SSS-2 Stablecoin | Create new stablecoin with compliance features |
| 2 | Update Roles | Assign blacklister, pauser, seizer roles |
| 3 | Add Minter with Quota | Add minter with 10,000 token quota |
| 4 | Update Minter Quota | Update quota to 20,000 tokens |
| 5 | Mint Tokens | Mint 1 token to user account |
| 6 | Transfer Tokens | Transfer 0.5 tokens between accounts |
| 7 | Burn Tokens | Burn 0.25 tokens |
| 8 | Add to Blacklist | Blacklist address with reason |
| 9 | Remove from Blacklist | Remove address from blacklist |
| 10 | Freeze Token Account | Freeze user token account |
| 11 | Thaw Token Account | Unfreeze token account |
| 12 | Pause Stablecoin | Pause all operations |
| 13 | Unpause Stablecoin | Resume operations |
| 14 | Transfer Authority | Transfer master authority |
| 15 | Remove Minter | Set minter quota to 0 |
| 16 | Full Workflow Integration | Complete lifecycle test |

---

## Expected Output

After running `./test-devnet.sh`, this file will be updated with:

- **Transaction Proofs** - Each test with:
  - Transaction signature
  - Solana Explorer link
  - Accounts involved
  - Timestamp

- **Summary Table** - Quick reference of all transactions

---

## Troubleshooting

### Insufficient Balance
```
Error: insufficient funds
```
**Solution:** Request more SOL from faucet

### Program Not Deployed
```
Error: Account does not exist
```
**Solution:** Run `./deploy-devnet.sh` first

### Rate Limited
```
Error: Too many requests
```
**Solution:** Wait a few minutes and retry

---

## Files Generated

| File | Description |
|------|-------------|
| `DEVNET_PROOF.md` | This proof document (auto-updated) |
| `devnet-test-output.log` | Full test output log |
| `.env.devnet` | Devnet configuration |

---

*This document will be automatically updated when tests are run.*