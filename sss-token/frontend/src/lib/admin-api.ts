/**
 * Admin API Client
 * 
 * Client-side helper for calling the admin API routes
 */

export type AdminOperation = 
  | 'freeze' 
  | 'thaw' 
  | 'blacklist-add' 
  | 'blacklist-remove' 
  | 'seize' 
  | 'pause' 
  | 'unpause' 
  | 'mint' 
  | 'burn';

export interface AdminOperationParams {
  operation: AdminOperation;
  mint?: string;
  targetAddress?: string;
  destinationAddress?: string;
  amount?: string;
  reason?: string;
  authorityType?: string;
}

export interface AdminApiResponse {
  success: boolean;
  signature?: string;
  operation?: string;
  authority?: string;
  explorerUrl?: string;
  error?: string;
  config?: TestConfig;
  logs?: string[];
}

export interface TestConfig {
  mint: string;
  keypairs: Record<string, string>;
  tokenAccounts?: {
    user: string;
    treasury: string;
  };
}

/**
 * Get test configuration
 */
export async function getTestConfig(): Promise<AdminApiResponse> {
  const response = await fetch('/api/admin');
  return response.json();
}

/**
 * Execute an admin operation
 */
export async function executeAdminOperation(params: AdminOperationParams): Promise<AdminApiResponse> {
  const response = await fetch('/api/admin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  return response.json();
}

/**
 * Freeze a token account
 */
export async function freezeAccount(mint: string, tokenAccount: string): Promise<AdminApiResponse> {
  return executeAdminOperation({
    operation: 'freeze',
    mint,
    targetAddress: tokenAccount,
  });
}

/**
 * Thaw a token account
 */
export async function thawAccount(mint: string, tokenAccount: string): Promise<AdminApiResponse> {
  return executeAdminOperation({
    operation: 'thaw',
    mint,
    targetAddress: tokenAccount,
  });
}

/**
 * Add address to blacklist
 */
export async function addToBlacklist(
  mint: string, 
  userAddress: string, 
  reason: string = 'Compliance violation'
): Promise<AdminApiResponse> {
  return executeAdminOperation({
    operation: 'blacklist-add',
    mint,
    targetAddress: userAddress,
    reason,
  });
}

/**
 * Remove address from blacklist
 */
export async function removeFromBlacklist(mint: string, userAddress: string): Promise<AdminApiResponse> {
  return executeAdminOperation({
    operation: 'blacklist-remove',
    mint,
    targetAddress: userAddress,
  });
}

/**
 * Seize tokens from a frozen account
 */
export async function seizeTokens(
  mint: string,
  sourceTokenAccount: string,
  destinationTokenAccount: string,
  amount: string
): Promise<AdminApiResponse> {
  return executeAdminOperation({
    operation: 'seize',
    mint,
    targetAddress: sourceTokenAccount,
    destinationAddress: destinationTokenAccount,
    amount,
  });
}

/**
 * Pause all token operations
 */
export async function pauseToken(mint: string): Promise<AdminApiResponse> {
  return executeAdminOperation({
    operation: 'pause',
    mint,
  });
}

/**
 * Unpause all token operations
 */
export async function unpauseToken(mint: string): Promise<AdminApiResponse> {
  return executeAdminOperation({
    operation: 'unpause',
    mint,
  });
}

/**
 * Mint tokens to a recipient
 */
export async function mintTokens(
  mint: string,
  recipientAddress: string,
  amount: string
): Promise<AdminApiResponse> {
  return executeAdminOperation({
    operation: 'mint',
    mint,
    targetAddress: recipientAddress,
    amount,
  });
}

/**
 * Burn tokens from an account
 */
export async function burnTokens(
  mint: string,
  tokenAccount: string,
  amount: string
): Promise<AdminApiResponse> {
  return executeAdminOperation({
    operation: 'burn',
    mint,
    targetAddress: tokenAccount,
    amount,
  });
}