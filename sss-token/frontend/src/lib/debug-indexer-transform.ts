/**
 * Debug Script for transformIndexerResponse
 * 
 * This script queries the local indexer API and analyzes the transformation
 * from IndexerStablecoin to StablecoinWithSupply step-by-step.
 * 
 * Usage:
 *   cd sss-token/frontend
 *   npx tsx src/lib/debug-indexer-transform.ts
 *   npx tsx src/lib/debug-indexer-transform.ts http://localhost:3004
 */

import { IndexerStablecoin, StablecoinWithSupply } from './types';

// Default indexer URL
const DEFAULT_INDEXER_URL = 'http://localhost:3004';

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function colorize(text: string, color: keyof typeof colors): string {
  return `${colors[color]}${text}${colors.reset}`;
}

function separator(title: string): void {
  console.log('\n' + colorize('='.repeat(60), 'cyan'));
  console.log(colorize(`  ${title}`, 'bright'));
  console.log(colorize('='.repeat(60), 'cyan'));
}

function subSeparator(title: string): void {
  console.log('\n' + colorize('-'.repeat(40), 'dim'));
  console.log(colorize(`  ${title}`, 'yellow'));
  console.log(colorize('-'.repeat(40), 'dim'));
}

/**
 * Transform indexer response to our internal type (COPY for debugging)
 * This is an exact copy of the function from fetch-indexer.ts for analysis
 */
function transformIndexerResponse(data: IndexerStablecoin): StablecoinWithSupply {
  return {
    address: data.address,
    masterAuthority: '', // Not provided by indexer summary
    mint: data.mint,
    name: data.name,
    symbol: data.symbol,
    uri: '',
    decimals: 6, // Default, should be fetched from chain if needed
    paused: data.paused,
    bump: 0, // Not needed for display
    enablePermanentDelegate: data.features.permanentDelegate,
    enableTransferHook: data.features.transferHook,
    defaultAccountFrozen: data.features.defaultAccountFrozen,
    blacklister: '',
    pauser: '',
    seizer: '',
    supply: data.supply != null ? BigInt(data.supply) : BigInt(0),
    holderCount: data.holderCount,
  };
}

/**
 * Detailed transformation with step-by-step logging
 */
function debugTransform(data: IndexerStablecoin, index: number): StablecoinWithSupply {
  subSeparator(`TRANSFORMING ITEM ${index + 1}`);

  console.log('\n' + colorize('>>> INPUT (IndexerStablecoin):', 'blue'));
  console.log(JSON.stringify(data, null, 2));

  console.log('\n' + colorize('>>> STEP-BY-STEP TRANSFORMATION:', 'magenta'));

  // Step 1: Direct mappings
  console.log('\n  Step 1: Direct mappings (source -> target)');
  console.log(`    address: "${colorize(data.address, 'green')}" -> "${colorize(data.address, 'green')}"`);
  console.log(`    mint: "${colorize(data.mint, 'green')}" -> "${colorize(data.mint, 'green')}"`);
  console.log(`    name: "${colorize(data.name, 'green')}" -> "${colorize(data.name, 'green')}"`);
  console.log(`    symbol: "${colorize(data.symbol, 'green')}" -> "${colorize(data.symbol, 'green')}"`);
  console.log(`    paused: ${colorize(String(data.paused), 'green')} -> ${colorize(String(data.paused), 'green')}`);
  console.log(`    holderCount: ${colorize(String(data.holderCount), 'green')} -> ${colorize(String(data.holderCount), 'green')}`);

  // Step 2: Feature mappings
  console.log('\n  Step 2: Feature mappings (nested -> flat)');
  console.log(`    features.permanentDelegate: ${colorize(String(data.features?.permanentDelegate), 'green')} -> enablePermanentDelegate: ${colorize(String(data.features?.permanentDelegate), 'green')}`);
  console.log(`    features.transferHook: ${colorize(String(data.features?.transferHook), 'green')} -> enableTransferHook: ${colorize(String(data.features?.transferHook), 'green')}`);
  console.log(`    features.defaultAccountFrozen: ${colorize(String(data.features?.defaultAccountFrozen), 'green')} -> defaultAccountFrozen: ${colorize(String(data.features?.defaultAccountFrozen), 'green')}`);

  // Step 3: Supply conversion
  console.log('\n  Step 3: Supply conversion (string -> BigInt)');
  if (data.supply != null) {
    console.log(`    supply: "${colorize(data.supply, 'green')}" (string) -> ${colorize(BigInt(data.supply).toString() + 'n', 'green')} (BigInt)`);
  } else {
    console.log(`    supply: ${colorize('undefined/null', 'yellow')} -> ${colorize('0n', 'yellow')} (default BigInt)`);
  }

  // Step 4: Defaulted fields (NOT provided by indexer)
  console.log('\n  Step 4: Defaulted fields (NOT provided by indexer)');
  console.log(`    masterAuthority: ${colorize('NOT PROVIDED', 'red')} -> "" (empty string)`);
  console.log(`    uri: ${colorize('NOT PROVIDED', 'red')} -> "" (empty string)`);
  console.log(`    decimals: ${colorize('NOT PROVIDED', 'red')} -> 6 (default)`);
  console.log(`    bump: ${colorize('NOT PROVIDED', 'red')} -> 0 (default)`);
  console.log(`    blacklister: ${colorize('NOT PROVIDED', 'red')} -> "" (empty string)`);
  console.log(`    pauser: ${colorize('NOT PROVIDED', 'red')} -> "" (empty string)`);
  console.log(`    seizer: ${colorize('NOT PROVIDED', 'red')} -> "" (empty string)`);

  // Perform actual transformation
  const result = transformIndexerResponse(data);

  console.log('\n' + colorize('>>> OUTPUT (StablecoinWithSupply):', 'blue'));
  console.log(JSON.stringify(result, (key, value) =>
    typeof value === 'bigint' ? value.toString() + 'n' : value
  , 2));

  // Summary of data loss
  console.log('\n' + colorize('>>> DATA LOSS SUMMARY:', 'yellow'));
  console.log('  Fields lost (not in indexer response):');
  console.log('    - masterAuthority (would need to fetch from chain)');
  console.log('    - uri (would need to fetch from chain)');
  console.log('    - decimals (assumed 6, should verify from chain)');
  console.log('    - bump (not needed for display, but lost)');
  console.log('    - blacklister (would need to fetch from chain)');
  console.log('    - pauser (would need to fetch from chain)');
  console.log('    - seizer (would need to fetch from chain)');

  return result;
}

/**
 * Compare two stablecoins side by side
 */
function compareInputOutput(input: IndexerStablecoin, output: StablecoinWithSupply): void {
  subSeparator('SIDE-BY-SIDE COMPARISON');

  const lines: [string, string, string][] = [
    ['Field', 'Indexer Input', 'Transformed Output'],
    ['-----', '--------------', '------------------'],
    ['address', input.address || '(missing)', output.address || '(missing)'],
    ['mint', input.mint || '(missing)', output.mint || '(missing)'],
    ['name', input.name || '(missing)', output.name || '(missing)'],
    ['symbol', input.symbol || '(missing)', output.symbol || '(missing)'],
    ['decimals', '(not provided)', String(output.decimals) + ' (default)'],
    ['paused', String(input.paused), String(output.paused)],
    ['supply', input.supply || '(not provided)', output.supply.toString() + 'n'],
    ['holderCount', String(input.holderCount), String(output.holderCount)],
    ['masterAuthority', '(not provided)', output.masterAuthority || '"" (default)'],
    ['uri', '(not provided)', output.uri || '"" (default)'],
    ['bump', '(not provided)', String(output.bump) + ' (default)'],
    ['enablePermanentDelegate', String(input.features?.permanentDelegate), String(output.enablePermanentDelegate)],
    ['enableTransferHook', String(input.features?.transferHook), String(output.enableTransferHook)],
    ['defaultAccountFrozen', String(input.features?.defaultAccountFrozen), String(output.defaultAccountFrozen)],
    ['blacklister', '(not provided)', output.blacklister || '"" (default)'],
    ['pauser', '(not provided)', output.pauser || '"" (default)'],
    ['seizer', '(not provided)', output.seizer || '"" (default)'],
  ];

  // Calculate column widths
  const colWidths = [0, 0, 0];
  lines.forEach(line => {
    line.forEach((cell, i) => {
      colWidths[i] = Math.max(colWidths[i], cell.length);
    });
  });

  // Print table
  lines.forEach((line, i) => {
    const padded = line.map((cell, j) => cell.padEnd(colWidths[j]));
    const joined = padded.join(' | ');
    if (i === 0) {
      console.log(colorize(joined, 'bright'));
    } else if (i === 1) {
      console.log(colorize(joined, 'dim'));
    } else {
      console.log(joined);
    }
  });
}

/**
 * Main debug function
 */
async function main(): Promise<void> {
  const indexerUrl = process.argv[2] || DEFAULT_INDEXER_URL;

  separator('INDEXER TRANSFORM DEBUG SCRIPT');

  console.log(`\nIndexer URL: ${colorize(indexerUrl, 'cyan')}`);
  console.log(`Endpoint: ${colorize(`${indexerUrl}/api/stablecoins`, 'cyan')}`);

  // Step 1: Fetch from indexer
  separator('STEP 1: FETCHING FROM INDEXER');

  let response: Response;
  try {
    response = await fetch(`${indexerUrl}/api/stablecoins`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log(`\nResponse Status: ${colorize(String(response.status), response.ok ? 'green' : 'red')} ${response.statusText}`);
  } catch (error) {
    console.error(colorize('\n❌ Failed to connect to indexer!', 'red'));
    console.error('Make sure the indexer API is running:');
    console.error(`  cd sss-token/backend`);
    console.error(`  docker-compose up -d postgres redis`);
    console.error(`  pnpm install`);
    console.error(`  pnpm --filter @sss-backend/indexer-api dev`);
    console.error('\nError details:', error);
    process.exit(1);
  }

  if (!response.ok) {
    console.error(colorize(`\n❌ Indexer returned error: ${response.status}`, 'red'));
    const text = await response.text();
    console.error('Response:', text);
    process.exit(1);
  }

  // Step 2: Parse JSON
  separator('STEP 2: PARSING JSON RESPONSE');

  let rawData: unknown;
  try {
    rawData = await response.json();
    console.log(colorize('\n✓ JSON parsed successfully', 'green'));
  } catch (error) {
    console.error(colorize('\n❌ Failed to parse JSON!', 'red'));
    console.error('Error:', error);
    process.exit(1);
  }

  // Step 3: Analyze raw data structure
  separator('STEP 3: RAW DATA STRUCTURE');

  if (!Array.isArray(rawData)) {
    console.log(colorize('\n⚠️  Response is NOT an array!', 'yellow'));
    console.log('Type:', typeof rawData);
    console.log('Value:', JSON.stringify(rawData, null, 2));
    
    // Check if it's wrapped in a data property
    if (rawData && typeof rawData === 'object' && 'data' in rawData) {
      console.log(colorize('\nFound "data" property, unwrapping...', 'yellow'));
      rawData = (rawData as any).data;
    }
  }

  const data = rawData as IndexerStablecoin[];
  console.log(`\nNumber of stablecoins: ${colorize(String(data.length), 'cyan')}`);

  if (data.length === 0) {
    console.log(colorize('\n⚠️  No stablecoins found in indexer!', 'yellow'));
    console.log('This could mean:');
    console.log('  1. No stablecoins have been created yet');
    console.log('  2. The indexer hasn\'t processed any Initialize events');
    console.log('  3. The database is empty');
    process.exit(0);
  }

  // Step 4: Show raw data
  separator('STEP 4: RAW INDEXER DATA');

  console.log('\nComplete raw response:');
  console.log(JSON.stringify(data, null, 2));

  // Step 5: Transform each item with detailed logging
  separator('STEP 5: TRANSFORMATION ANALYSIS');

  const transformed: StablecoinWithSupply[] = [];

  data.forEach((item, index) => {
    const result = debugTransform(item, index);
    compareInputOutput(item, result);
    transformed.push(result);
  });

  // Step 6: Final summary
  separator('STEP 6: FINAL SUMMARY');

  console.log('\nTransformed stablecoins:');
  transformed.forEach((coin, i) => {
    console.log(`\n  [${i + 1}] ${colorize(coin.name, 'bright')} (${coin.symbol})`);
    console.log(`      Mint: ${coin.mint}`);
    console.log(`      Address: ${coin.address}`);
    console.log(`      Supply: ${coin.supply} (raw: ${coin.supply.toString()})`);
    console.log(`      Holders: ${coin.holderCount}`);
    console.log(`      Paused: ${coin.paused}`);
    console.log(`      Features:`);
    console.log(`        - Permanent Delegate: ${coin.enablePermanentDelegate}`);
    console.log(`        - Transfer Hook: ${coin.enableTransferHook}`);
    console.log(`        - Default Frozen: ${coin.defaultAccountFrozen}`);
  });

  separator('DEBUG COMPLETE');
}

// Run the script
main().catch(error => {
  console.error(colorize('\n❌ Unexpected error!', 'red'));
  console.error(error);
  process.exit(1);
});