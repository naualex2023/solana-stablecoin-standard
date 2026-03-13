import { NextRequest, NextResponse } from 'next/server';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  ExtensionType,
  getMintLen,
  createInitializePermanentDelegateInstruction,
  createInitializeMintInstruction,
} from '@solana/spl-token';
import { AnchorProvider } from '@coral-xyz/anchor';
import path from 'path';
import fs from 'fs';

// NodeWallet implementation for server-side signing
class NodeWallet {
  private readonly payer: Keypair;
  constructor(payer: Keypair) { this.payer = payer; }
  async signTransaction(tx: any): Promise<any> { tx.partialSign(this.payer); return tx; }
  async signAllTransactions(txs: any[]): Promise<any[]> { return Promise.all(txs.map(async (tx) => { tx.partialSign(this.payer); return tx; })); }
  get publicKey(): PublicKey { return this.payer.publicKey; }
}

// Use eval('require') to bypass Next.js webpack bundling
const loadSDK = () => {
  const sdkPath = path.resolve(process.cwd(), '..', 'sdk', 'dist', 'index.js');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return eval('require')(sdkPath);
};

// RPC endpoint based on environment
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'http://localhost:8899';
const WALLETS_DIR = path.resolve(process.cwd(), '..', 'scripts', 'test-wallets');

// Load authority keypair from test-wallets
const loadAuthorityKeypair = (): Keypair => {
  const testWalletPath = path.join(WALLETS_DIR, 'authority.json');
  if (fs.existsSync(testWalletPath)) {
    const secretKey = JSON.parse(fs.readFileSync(testWalletPath, 'utf-8'));
    return Keypair.fromSecretKey(new Uint8Array(secretKey));
  }
  console.warn('Warning: Using generated keypair - no authority wallet found');
  return Keypair.generate();
};

interface CreateRequest {
  name: string;
  symbol: string;
  decimals: number;
  uri?: string;
  preset: 'sss-1' | 'sss-2' | 'custom';
  enablePermanentDelegate?: boolean;
  enableTransferHook?: boolean;
  defaultAccountFrozen?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    // Load SDK dynamically
    const sdkModule = loadSDK();
    const { SSSTokenClient, findPermanentDelegatePDA, findFreezeAuthorityPDA, SSS_TOKEN_PROGRAM_ID } = sdkModule;
    
    if (!SSSTokenClient) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'SDK not loaded. Make sure to build the SDK first: cd sss-token/sdk && npm run build',
          sdkPath: path.resolve(process.cwd(), '..', 'sdk', 'dist', 'index.js'),
        },
        { status: 500 }
      );
    }

    const body: CreateRequest = await request.json();
    const {
      name,
      symbol,
      decimals,
      uri = '',
      preset,
      enablePermanentDelegate = preset === 'sss-2',
      enableTransferHook = preset === 'sss-2',
      defaultAccountFrozen = false,
    } = body;

    // Validate required fields
    if (!name || !symbol) {
      return NextResponse.json(
        { success: false, error: 'Name and symbol are required' },
        { status: 400 }
      );
    }

    // Connect to network
    const connection = new Connection(RPC_URL, 'confirmed');
    
    // Load authority keypair
    const authority = loadAuthorityKeypair();
    
    // Check authority has SOL
    const balance = await connection.getBalance(authority.publicKey);
    if (balance < 10000000) { // 0.01 SOL
      // Try to airdrop if on localnet
      if (RPC_URL.includes('localhost') || RPC_URL.includes('127.0.0.1')) {
        try {
          const signature = await connection.requestAirdrop(authority.publicKey, 1000000000); // 1 SOL
          await connection.confirmTransaction(signature, 'confirmed');
        } catch (e) {
          return NextResponse.json(
            { success: false, error: 'Insufficient SOL and airdrop failed. Please fund the authority wallet.' },
            { status: 400 }
          );
        }
      } else {
        return NextResponse.json(
          { success: false, error: `Insufficient SOL in authority wallet. Balance: ${balance / 1000000000} SOL` },
          { status: 400 }
        );
      }
    }

    // Create mint keypair
    const mintKeypair = Keypair.generate();
    const programId = new PublicKey(SSS_TOKEN_PROGRAM_ID);

    // Derive PDAs for SSS-2
    const { pda: permanentDelegate } = enablePermanentDelegate 
      ? findPermanentDelegatePDA(mintKeypair.publicKey, programId)
      : { pda: undefined };
    
    const { pda: freezeAuthority } = preset === 'sss-2'
      ? findFreezeAuthorityPDA(mintKeypair.publicKey, programId)
      : { pda: authority.publicKey };

    console.log(`Creating mint: ${mintKeypair.publicKey.toString()}`);
    console.log(`Preset: ${preset}, Permanent Delegate: ${enablePermanentDelegate}`);

    // Build mint creation transaction
    const extensions = enablePermanentDelegate ? [ExtensionType.PermanentDelegate] : [];
    const mintLen = getMintLen(extensions);
    const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

    const transaction = new Transaction();

    // Create mint account
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: authority.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: mintLen,
        lamports,
        programId: TOKEN_2022_PROGRAM_ID,
      })
    );

    // Initialize permanent delegate extension if enabled
    if (enablePermanentDelegate && permanentDelegate) {
      transaction.add(
        createInitializePermanentDelegateInstruction(
          mintKeypair.publicKey,
          permanentDelegate,
          TOKEN_2022_PROGRAM_ID
        )
      );
    }

    // Initialize mint
    transaction.add(
      createInitializeMintInstruction(
        mintKeypair.publicKey,
        decimals,
        authority.publicKey, // mint authority
        preset === 'sss-2' ? freezeAuthority! : authority.publicKey, // freeze authority
        TOKEN_2022_PROGRAM_ID
      )
    );

    // Send transaction
    const mintSignature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [authority, mintKeypair],
      { commitment: 'confirmed' }
    );

    console.log(`Mint created: ${mintSignature}`);

    // Initialize stablecoin config via SDK
    const wallet = new NodeWallet(authority);
    const provider = new AnchorProvider(connection, wallet as any, {});
    const sdk = new SSSTokenClient({ provider });

    const initSignature = await sdk.initialize(
      mintKeypair.publicKey,
      authority,
      {
        name,
        symbol,
        uri,
        decimals,
        enablePermanentDelegate,
        enableTransferHook,
        defaultAccountFrozen,
      }
    );

    await connection.confirmTransaction(initSignature, 'confirmed');
    console.log(`Config initialized: ${initSignature}`);

    // Get explorer URL based on network
    const network = RPC_URL.includes('devnet') ? 'devnet' : 
                    RPC_URL.includes('mainnet') ? 'mainnet-beta' : 
                    'localnet';
    const explorerUrl = network === 'localnet' 
      ? '#' 
      : `https://explorer.solana.com/tx/${initSignature}?cluster=${network}`;

    return NextResponse.json({
      success: true,
      mintAddress: mintKeypair.publicKey.toString(),
      signature: initSignature,
      explorerUrl,
      config: {
        name,
        symbol,
        decimals,
        preset,
        enablePermanentDelegate,
        enableTransferHook,
      },
    });

  } catch (error: any) {
    console.error('Create stablecoin error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Failed to create stablecoin',
        details: error.toString(),
      },
      { status: 500 }
    );
  }
}