/**
 * Debug script for parsing a specific devnet transaction
 * 
 * Usage: npx ts-node debug-parse-tx.ts
 * 
 * Transaction: https://explorer.solana.com/tx/2t3G9A2roa7F7mN4pgHPHpVbdHv8Yvp9WFjQCneAuiuLvmF4kxtishgvNEDaFHT2oYHmU2Dhdo3QdnrSEJDeKqq8?cluster=devnet
 */

import { Connection } from '@solana/web3.js';

// Configuration
const RPC_URL = 'https://api.devnet.solana.com';
const SIGNATURE = '2t3G9A2roa7F7mN4pgHPHpVbdHv8Yvp9WFjQCneAuiuLvmF4kxtishgvNEDaFHT2oYHmU2Dhdo3QdnrSEJDeKqq8';
const PROGRAM_ID = 'Hf1s4EvjS79S6kcHdKhaZHVQsnsjqMbJgBEFZfaGDPmw';

async function debugParseTransaction() {
  console.log('='.repeat(60));
  console.log('SSS Token Indexer - Transaction Parser Debug');
  console.log('='.repeat(60));
  console.log('');
  console.log('Configuration:');
  console.log('  RPC URL:', RPC_URL);
  console.log('  Signature:', SIGNATURE);
  console.log('  Program ID:', PROGRAM_ID);
  console.log('');

  // Connect to devnet
  const connection = new Connection(RPC_URL, 'confirmed');
  
  console.log('[1] Fetching transaction...');
  const tx = await connection.getParsedTransaction(SIGNATURE, {
    maxSupportedTransactionVersion: 0,
  });

  if (!tx) {
    console.error('ERROR: Transaction not found!');
    return;
  }

  console.log('[2] Transaction found!');
  console.log('  Slot:', tx.slot);
  console.log('  Block Time:', new Date(tx.blockTime! * 1000).toISOString());
  console.log('  Fee:', tx.meta?.fee);
  console.log('  Error:', tx.meta?.err || 'None');
  console.log('');

  // Parse logs
  console.log('[3] Parsing logs...');
  const logs = tx.meta?.logMessages || [];
  console.log('  Log count:', logs.length);
  console.log('');
  console.log('  Raw logs:');
  logs.forEach((log, i) => {
    console.log(`    [${i}] ${log}`);
  });
  console.log('');

  // Parse instruction type from logs
  console.log('[4] Parsing instruction type from logs...');
  let instructionType: string | null = null;
  for (const log of logs) {
    if (log.includes('Program log: Instruction:')) {
      const match = log.match(/Instruction:\s*(\w+)/);
      if (match) {
        instructionType = match[1];
        console.log('  Found instruction type:', instructionType);
      }
    }
  }
  
  if (!instructionType) {
    console.log('  No SSS instruction found in logs');
    return;
  }
  console.log('');

  // Get message and account keys
  console.log('[5] Analyzing message structure...');
  const message = tx.transaction.message;
  
  console.log('  Message type:', 'version' in message ? `v${(message as any).version}` : 'legacy');
  
  // Get account keys
  let accountKeys: any[] = [];
  if ('accountKeys' in message) {
    accountKeys = (message as any).accountKeys;
  } else if ('staticAccountKeys' in message) {
    accountKeys = (message as any).staticAccountKeys;
  }
  
  console.log('  Account keys count:', accountKeys.length);
  console.log('');
  console.log('  Account keys:');
  accountKeys.forEach((key: any, i: number) => {
    const pubkey = typeof key === 'string' ? key : key?.pubkey?.toString?.() || key?.toString?.() || 'unknown';
    const signer = typeof key === 'object' ? key?.signer : '?';
    const writable = typeof key === 'object' ? key?.writable : '?';
    console.log(`    [${i}] ${pubkey} (signer: ${signer}, writable: ${writable})`);
  });
  console.log('');

  // Find program in account keys
  console.log('[6] Finding program in account keys...');
  const programIndex = accountKeys.findIndex(
    (key: any) => key?.pubkey?.toString() === PROGRAM_ID || 
                  (typeof key === 'string' ? key === PROGRAM_ID : key?.toString() === PROGRAM_ID)
  );
  console.log('  Program index in account keys:', programIndex);
  
  if (programIndex === -1) {
    console.log('  WARNING: Program not found in account keys!');
  }
  console.log('');

  // Get instructions
  console.log('[7] Analyzing instructions...');
  let instructions: any[] = [];
  if ('instructions' in message) {
    instructions = (message as any).instructions;
  } else if ('compiledInstructions' in message) {
    instructions = (message as any).compiledInstructions;
  }
  
  console.log('  Instructions count:', instructions.length);
  console.log('');

  // Process each instruction
  for (let ixIndex = 0; ixIndex < instructions.length; ixIndex++) {
    const ix = instructions[ixIndex];
    console.log(`  [${ixIndex}] Instruction:`);
    console.log(`      RAW INSTRUCTION OBJECT:`);
    console.log(JSON.stringify(ix, null, 8).split('\n').map((l: string) => `      ${l}`).join('\n'));
    
    // Handle both parsed and compiled transaction formats
    let ixProgramStr: string;
    let accounts: string[];
    
    if (ix.programId) {
      // Parsed transaction format - programId is a PublicKey object or string
      console.log(`      FORMAT: Parsed transaction (programId is present)`);
      console.log(`      programId type: ${typeof ix.programId}, constructor: ${ix.programId?.constructor?.name}`);
      // Convert PublicKey to string if needed
      ixProgramStr = typeof ix.programId === 'string' 
        ? ix.programId 
        : ix.programId?.toString?.() || '';
      accounts = ix.accounts || [];
    } else if (ix.programIdIndex !== undefined) {
      // Compiled transaction format - need to look up from accountKeys
      console.log(`      FORMAT: Compiled transaction (programIdIndex: ${ix.programIdIndex})`);
      const programKey = accountKeys[ix.programIdIndex];
      ixProgramStr = typeof programKey === 'string' 
        ? programKey 
        : programKey?.pubkey?.toString?.() || programKey?.toString?.() || '';
      
      // Extract accounts from instruction - ix.accounts contains indices into accountKeys
      const accountIndices = ix.accounts || [];
      accounts = accountIndices.map((idx: number) => {
        const acc = accountKeys[idx];
        if (typeof acc === 'string') return acc;
        return acc?.pubkey?.toString?.() || acc?.toString?.() || '';
      });
    } else {
      console.log('      FORMAT: Unknown - skipping');
      continue;
    }
    
    console.log(`      program: ${ixProgramStr}`);
    console.log(`      PROGRAM_ID: ${PROGRAM_ID}`);
    console.log(`      program length: ${ixProgramStr.length}`);
    console.log(`      PROGRAM_ID length: ${PROGRAM_ID.length}`);
    console.log(`      program hex: ${Buffer.from(ixProgramStr).toString('hex')}`);
    console.log(`      PROGRAM_ID hex: ${Buffer.from(PROGRAM_ID).toString('hex')}`);
    console.log(`      is SSS program: ${ixProgramStr === PROGRAM_ID}`);
    
    if (ixProgramStr !== PROGRAM_ID) {
      console.log('      (skipping - not our program)');
      continue;
    }

    console.log(`      accounts:`);
    accounts.forEach((acc: string, i: number) => {
      console.log(`        [${i}] ${acc}`);
    });
    console.log(`      accounts:`);
    accounts.forEach((acc: string, i: number) => {
      console.log(`        [${i}] ${acc}`);
    });

    // Parse instruction data
    console.log(`      data (base64): ${ix.data}`);
    if (ix.data) {
      try {
        const dataBuffer = Buffer.from(ix.data, 'base64');
        console.log(`      data (hex): ${dataBuffer.toString('hex')}`);
        console.log(`      data length: ${dataBuffer.length} bytes`);
        console.log(`      discriminator (first 8 bytes): ${dataBuffer.slice(0, 8).toString('hex')}`);
        
        // Try to decode Anchor discriminator
        const discriminator = dataBuffer.slice(0, 8);
        const discriminatorHex = discriminator.toString('hex');
        
        // Common Anchor discriminators
        const knownDiscriminators: Record<string, string> = {
          '8e2c83658a79beec': 'Initialize',
          '2d9a5c0b0e1f8c3d': 'MintTokens',
          '3e0b9f4b8e2c8365': 'BurnTokens',
          'f8c3d8e2c83658a7': 'Pause',
          'c83658a79beec8e2': 'Unpause',
        };
        
        if (knownDiscriminators[discriminatorHex]) {
          console.log(`      known discriminator: ${knownDiscriminators[discriminatorHex]}`);
        }
      } catch (e) {
        console.log(`      error decoding data: ${e}`);
      }
    }

    // Determine mint address
    let mintAddress = accounts[0] || '';
    console.log(`      mint address (accounts[0]): ${mintAddress}`);

    // Build event data
    console.log('');
    console.log('  [8] Event data that would be stored:');
    const eventData = {
      signature: SIGNATURE,
      slot: tx.slot,
      blockTime: new Date(tx.blockTime! * 1000),
      instructionType,
      mintAddress,
      data: {
        accounts,
        instruction: ix.data ? {
          raw: ix.data,
          discriminator: Buffer.from(ix.data, 'base64').slice(0, 8).toString('hex'),
        } : {},
        logs: logs.slice(0, 20),
        fee: tx.meta?.fee,
        success: !tx.meta?.err,
      },
    };
    console.log(JSON.stringify(eventData, null, 2));
    
    // Only process first matching instruction
    break;
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('Debug complete!');
  console.log('='.repeat(60));
}

// Run the debug function
debugParseTransaction().catch(console.error);