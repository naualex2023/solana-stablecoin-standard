import { NextRequest, NextResponse } from 'next/server';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, getAssociatedTokenAddress, getMint, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { AnchorProvider, BN } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';

class NodeWallet {
  private readonly payer: Keypair;
  constructor(payer: Keypair) { this.payer = payer; }
  async signTransaction(tx: any): Promise<any> { tx.partialSign(this.payer); return tx; }
  async signAllTransactions(txs: any[]): Promise<any[]> { return Promise.all(txs.map(async (tx) => { tx.partialSign(this.payer); return tx; })); }
  get publicKey(): PublicKey { return this.payer.publicKey; }
}

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'http://localhost:8899';
const WALLETS_DIR = path.resolve(process.cwd(), '..', 'scripts', 'test-wallets');
const CONFIG_FILE = path.join(WALLETS_DIR, 'config.json');

interface TestConfig { mint: string; keypairs: Record<string, string>; tokenAccount?: { user: string; treasury: string; }; }

function loadConfig(): TestConfig | null {
  try { if (fs.existsSync(CONFIG_FILE)) return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')); } catch (e) {}
  return null;
}

function loadKeypair(name: string): Keypair {
  const filePath = path.join(WALLETS_DIR, `${name}.json`);
  const secretKey = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return Keypair.fromSecretKey(new Uint8Array(secretKey));
}

// SSS Token Program ID - used to derive PDA authorities
const SSS_TOKEN_PROGRAM_ID = new PublicKey('Hf1s4EvjS79S6kcHdKhaZHVQsnsjqMbJgBEFZfaGDPmw');

/**
 * Check if the mint's freeze authority is the SSS program's PDA
 * This indicates an SSS-2 style mint that requires PDA-based freeze/thaw methods
 */
async function isPdaFreezeAuthority(connection: Connection, mint: PublicKey): Promise<boolean> {
  try {
    const mintInfo = await getMint(connection, mint, 'confirmed', TOKEN_2022_PROGRAM_ID);
    if (!mintInfo.freezeAuthority) return false;
    
    // Derive the expected freeze authority PDA
    const [freezeAuthorityPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('freeze_authority'), mint.toBuffer()],
      SSS_TOKEN_PROGRAM_ID
    );
    
    return mintInfo.freezeAuthority.equals(freezeAuthorityPda);
  } catch {
    return false;
  }
}

function createSDKClient(authorityKeypair: Keypair): { sdk: any; connection: Connection } {
  const connection = new Connection(RPC_URL, 'confirmed');
  const wallet = new NodeWallet(authorityKeypair);
  const provider = new AnchorProvider(connection, wallet as any, {});
  const sdkPath = path.resolve(process.cwd(), '..', 'sdk', 'dist', 'index.js');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const sdkModule = eval('require')(sdkPath);
  const sdk = new sdkModule.SSSTokenClient({ provider });
  return { sdk, connection };
}

export async function GET() {
  try {
    const config = loadConfig();
    if (!config) return NextResponse.json({ success: false, error: 'No test config found. Run setup-test-wallets.ts first.' }, { status: 404 });
    return NextResponse.json({ success: true, config: { mint: config.mint, keypairs: config.keypairs, tokenAccounts: config.tokenAccount } });
  } catch (error: any) { return NextResponse.json({ success: false, error: error.message }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { operation, mint: mintStr, targetAddress, destinationAddress, amount, reason, authorityType } = body;
    const validOps = ['freeze', 'thaw', 'blacklist-add', 'blacklist-remove', 'seize', 'pause', 'unpause', 'mint', 'burn'];
    if (!operation || !validOps.includes(operation)) return NextResponse.json({ success: false, error: `Invalid operation` }, { status: 400 });
    
    const config = loadConfig();
    const mintAddress = mintStr || config?.mint;
    if (!mintAddress) return NextResponse.json({ success: false, error: 'No mint address' }, { status: 400 });
    const mint = new PublicKey(mintAddress);
    
    // For SSS-2 mints with PDA freeze authority, freeze/thaw require seizer role
    // For SSS-1 mints with keypair freeze authority, freeze/thaw require authority keypair
    const authMap: Record<string, string> = { freeze: 'authority', thaw: 'authority', 'blacklist-add': 'blacklister', 'blacklist-remove': 'blacklister', seize: 'seizer', pause: 'pauser', unpause: 'pauser', mint: 'authority', burn: authorityType || 'user' };
    let finalAuthority = authorityType || authMap[operation] || 'authority';
    
    // Pre-check for PDA freeze authority (SSS-2 mints)
    const connection = new Connection(RPC_URL, 'confirmed');
    const usePdaMethods = await isPdaFreezeAuthority(connection, mint);
    
    // For SSS-2 mints, freeze/thaw require seizer role (not authority)
    if (usePdaMethods && (operation === 'freeze' || operation === 'thaw')) {
      finalAuthority = 'seizer';
    }
    
    let authorityKeypair: Keypair;
    try { authorityKeypair = loadKeypair(finalAuthority); } catch { return NextResponse.json({ success: false, error: `Failed to load keypair: ${finalAuthority}` }, { status: 400 }); }
    
    const { sdk } = createSDKClient(authorityKeypair);
    let signature: string;
    
    switch (operation) {
      case 'freeze': {
        if (!targetAddress) return NextResponse.json({ success: false, error: 'targetAddress required' }, { status: 400 });
        // targetAddress is the wallet address - derive the ATA
        const tokenAccount = await getAssociatedTokenAddress(mint, new PublicKey(targetAddress), undefined, TOKEN_2022_PROGRAM_ID);
        // Use PDA method for SSS-2 mints, keypair method for SSS-1 mints
        if (usePdaMethods) {
          signature = await sdk.freezeTokenAccountPda(mint, tokenAccount, authorityKeypair);
        } else {
          signature = await sdk.freezeTokenAccount(mint, tokenAccount, authorityKeypair);
        }
        break;
      }
      case 'thaw': {
        if (!targetAddress) return NextResponse.json({ success: false, error: 'targetAddress required' }, { status: 400 });
        // targetAddress is the wallet address - derive the ATA
        const tokenAccount = await getAssociatedTokenAddress(mint, new PublicKey(targetAddress), undefined, TOKEN_2022_PROGRAM_ID);
        // Use PDA method for SSS-2 mints, keypair method for SSS-1 mints
        if (usePdaMethods) {
          signature = await sdk.thawTokenAccountPda(mint, tokenAccount, authorityKeypair);
        } else {
          signature = await sdk.thawTokenAccount(mint, tokenAccount, authorityKeypair);
        }
        break;
      }
      case 'blacklist-add': {
        if (!targetAddress) return NextResponse.json({ success: false, error: 'targetAddress required' }, { status: 400 });
        signature = await sdk.addToBlacklist(mint, authorityKeypair, { user: new PublicKey(targetAddress), reason: reason || 'Compliance violation' });
        break;
      }
      case 'blacklist-remove': {
        if (!targetAddress) return NextResponse.json({ success: false, error: 'targetAddress required' }, { status: 400 });
        signature = await sdk.removeFromBlacklist(mint, authorityKeypair, { user: new PublicKey(targetAddress) });
        break;
      }
      case 'seize': {
        if (!targetAddress || !destinationAddress || !amount) return NextResponse.json({ success: false, error: 'targetAddress, destinationAddress, amount required' }, { status: 400 });
        // targetAddress and destinationAddress are wallet addresses - derive ATAs
        const sourceTokenAccount = await getAssociatedTokenAddress(mint, new PublicKey(targetAddress), undefined, TOKEN_2022_PROGRAM_ID);
        const destTokenAccount = await getAssociatedTokenAddress(mint, new PublicKey(destinationAddress), undefined, TOKEN_2022_PROGRAM_ID);
        signature = await sdk.seize(mint, authorityKeypair, { sourceToken: sourceTokenAccount, destToken: destTokenAccount, amount: new BN(amount) });
        break;
      }
      case 'pause': { signature = await sdk.pause(mint, authorityKeypair); break; }
      case 'unpause': { signature = await sdk.unpause(mint, authorityKeypair); break; }
      case 'mint': {
        if (!targetAddress || !amount) return NextResponse.json({ success: false, error: 'targetAddress and amount required' }, { status: 400 });
        const tokenAccount = await getOrCreateAssociatedTokenAccount(connection, authorityKeypair, mint, new PublicKey(targetAddress), undefined, undefined, undefined, TOKEN_2022_PROGRAM_ID);
        const minterKeypair = loadKeypair('minter');
        signature = await sdk.mintTokens(mint, authorityKeypair, minterKeypair.publicKey, tokenAccount.address, { amount: new BN(amount) });
        break;
      }
      case 'burn': {
        if (!targetAddress || !amount) return NextResponse.json({ success: false, error: 'targetAddress and amount required' }, { status: 400 });
        // targetAddress is the wallet address - derive the ATA
        const tokenAccount = await getAssociatedTokenAddress(mint, new PublicKey(targetAddress), undefined, TOKEN_2022_PROGRAM_ID);
        signature = await sdk.burnTokens(mint, tokenAccount, authorityKeypair, { amount: new BN(amount) });
        break;
      }
      default: return NextResponse.json({ success: false, error: 'Unknown operation' }, { status: 400 });
    }
    
    await connection.confirmTransaction(signature, 'confirmed');
    return NextResponse.json({ success: true, signature, operation, authority: finalAuthority, explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${encodeURIComponent(RPC_URL)}` });
  } catch (error: any) {
    console.error('Admin operation failed:', error);
    return NextResponse.json({ success: false, error: error.message || 'Unknown error', logs: error.logs }, { status: 500 });
  }
}