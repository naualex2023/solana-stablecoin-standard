'use client';

import { FC, useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import {
  AdminOperation,
  AdminApiResponse,
  TestConfig,
  executeAdminOperation,
  getTestConfig,
} from '@/lib/admin-api';

type Operation = 'mint' | 'burn' | 'freeze' | 'thaw' | 'blacklist-add' | 'blacklist-remove' | 'seize' | 'pause' | 'unpause';

interface OperationConfig {
  name: string;
  icon: string;
  description: string;
  requiresAmount: boolean;
  requiresAddress: boolean;
  requiresDestination: boolean;
  color: string;
  authorityType: string;
}

const operations: Record<Operation, OperationConfig> = {
  mint: {
    name: 'Mint Tokens',
    icon: '🪙',
    description: 'Create new tokens and send to recipient',
    requiresAmount: true,
    requiresAddress: true,
    requiresDestination: false,
    color: 'success',
    authorityType: 'authority',
  },
  burn: {
    name: 'Burn Tokens',
    icon: '🔥',
    description: 'Destroy tokens from an account',
    requiresAmount: true,
    requiresAddress: true,
    requiresDestination: false,
    color: 'error',
    authorityType: 'user',
  },
  freeze: {
    name: 'Freeze Account',
    icon: '❄️',
    description: 'Freeze a token account',
    requiresAmount: false,
    requiresAddress: true,
    requiresDestination: false,
    color: 'warning',
    authorityType: 'authority',
  },
  thaw: {
    name: 'Thaw Account',
    icon: '☀️',
    description: 'Unfreeze a token account',
    requiresAmount: false,
    requiresAddress: true,
    requiresDestination: false,
    color: 'success',
    authorityType: 'authority',
  },
  'blacklist-add': {
    name: 'Add to Blacklist',
    icon: '🚫',
    description: 'Add address to blacklist (SSS-2)',
    requiresAmount: false,
    requiresAddress: true,
    requiresDestination: false,
    color: 'error',
    authorityType: 'blacklister',
  },
  'blacklist-remove': {
    name: 'Remove from Blacklist',
    icon: '✅',
    description: 'Remove address from blacklist',
    requiresAmount: false,
    requiresAddress: true,
    requiresDestination: false,
    color: 'success',
    authorityType: 'blacklister',
  },
  seize: {
    name: 'Seize Tokens',
    icon: '🔐',
    description: 'Seize tokens from an account (SSS-2)',
    requiresAmount: true,
    requiresAddress: true,
    requiresDestination: true,
    color: 'error',
    authorityType: 'seizer',
  },
  pause: {
    name: 'Pause Token',
    icon: '⏸️',
    description: 'Pause all token operations',
    requiresAmount: false,
    requiresAddress: false,
    requiresDestination: false,
    color: 'warning',
    authorityType: 'pauser',
  },
  unpause: {
    name: 'Unpause Token',
    icon: '▶️',
    description: 'Resume all token operations',
    requiresAmount: false,
    requiresAddress: false,
    requiresDestination: false,
    color: 'success',
    authorityType: 'pauser',
  },
};

export default function AdminPage() {
  const { publicKey, connected } = useWallet();
  const [selectedOp, setSelectedOp] = useState<Operation | null>(null);
  const [mintAddress, setMintAddress] = useState<string>('');
  const [targetAddress, setTargetAddress] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; signature?: string; error?: string; explorerUrl?: string } | null>(null);
  const [testConfig, setTestConfig] = useState<TestConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);

  useEffect(() => {
    // Check the new key first (from dashboard selection), then fallback to old key (from create page)
    const saved = localStorage.getItem('selectedStablecoinMint') || localStorage.getItem('sss_mint_address');
    if (saved) setMintAddress(saved);
  }, []);

  // Load test configuration
  useEffect(() => {
    async function loadConfig() {
      try {
        const response = await getTestConfig();
        if (response.success && response.config) {
          setTestConfig(response.config);
          // Auto-fill mint address if not set
          if (!mintAddress && response.config.mint) {
            setMintAddress(response.config.mint);
          }
        }
      } catch (error) {
        console.log('Test config not available (this is OK for production use)');
      } finally {
        setConfigLoading(false);
      }
    }
    loadConfig();
  }, [mintAddress]);

  const handleSubmit = async () => {
    if (!selectedOp) return;
    
    setLoading(true);
    setResult(null);
    
    try {
      const params: any = {
        operation: selectedOp as AdminOperation,
        mint: mintAddress,
      };

      // Add operation-specific parameters
      if (operations[selectedOp].requiresAddress) {
        params.targetAddress = targetAddress;
      }
      if (operations[selectedOp].requiresDestination) {
        params.destinationAddress = destinationAddress;
      }
      if (operations[selectedOp].requiresAmount) {
        // Convert human-readable amount to raw amount (6 decimals)
        const rawAmount = amount.includes('.') 
          ? parseFloat(amount) * 1_000_000 
          : parseInt(amount);
        params.amount = rawAmount.toString();
      }
      if (selectedOp === 'blacklist-add') {
        params.reason = reason || 'Compliance violation';
      }

      const response = await executeAdminOperation(params);
      
      if (response.success) {
        setResult({ 
          success: true, 
          signature: response.signature,
          explorerUrl: response.explorerUrl,
        });
      } else {
        setResult({ 
          success: false, 
          error: response.error || 'Unknown error',
        });
      }
    } catch (error: any) {
      setResult({ success: false, error: error.message });
    } finally {
      setLoading(false);
    }
  };

  // Helper to fill test addresses
  const fillTestAddress = (type: 'user' | 'treasury' | 'authority' | 'blacklister' | 'pauser' | 'seizer') => {
    if (testConfig?.keypairs?.[type]) {
      setTargetAddress(testConfig.keypairs[type]);
    } else if (testConfig?.tokenAccounts?.[type as 'user' | 'treasury']) {
      setTargetAddress(testConfig.tokenAccounts[type as 'user' | 'treasury']);
    }
  };

  const fillTreasuryAddress = () => {
    // Use treasury wallet address (API derives ATA from wallet address)
    if (testConfig?.keypairs?.treasury) {
      setDestinationAddress(testConfig.keypairs.treasury);
    }
  };

  if (!connected) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <div className="w-20 h-20 rounded-2xl bg-primary-600/20 flex items-center justify-center text-4xl mx-auto mb-6">
          🔒
        </div>
        <h1 className="text-2xl font-bold mb-4">Connect Your Wallet</h1>
        <p className="text-gray-400">Connect your wallet to access admin operations</p>
      </div>
    );
  }

  if (!mintAddress) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <div className="w-20 h-20 rounded-2xl bg-warning/20 flex items-center justify-center text-4xl mx-auto mb-6">
          ⚠️
        </div>
        <h1 className="text-2xl font-bold mb-4">No Stablecoin Selected</h1>
        <p className="text-gray-400 mb-6">Create a stablecoin first to access admin operations</p>
        <a
          href="/create"
          className="px-6 py-3 bg-primary-600 hover:bg-primary-700 rounded-xl font-medium transition-colors"
        >
          Create Stablecoin
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">
          <span className="gradient-text">Admin Operations</span>
        </h1>
        <p className="text-gray-400">Manage your stablecoin with administrative actions</p>
      </div>

      {/* Test Config Info */}
      {testConfig && (
        <div className="mb-6 bg-primary-600/10 border border-primary-600/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">🧪</span>
            <span className="font-medium text-primary-400">Test Environment Detected</span>
          </div>
          <p className="text-gray-400 text-sm mb-3">
            Test wallets are available. Use the "Fill" buttons to auto-populate addresses.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            {Object.entries(testConfig.keypairs || {}).slice(0, 4).map(([name, address]) => (
              <div key={name} className="bg-dark-300 rounded-lg p-2">
                <span className="text-gray-500 capitalize">{name}:</span>
                <p className="text-gray-300 font-mono truncate">{address}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Operations Grid */}
        <div className="lg:col-span-1">
          <h2 className="text-lg font-semibold mb-4 text-white">Select Operation</h2>
          <div className="space-y-2">
            {Object.entries(operations).map(([key, op]) => (
              <button
                key={key}
                onClick={() => {
                  setSelectedOp(key as Operation);
                  setResult(null);
                }}
                className={`w-full p-4 rounded-xl text-left transition-all flex items-center gap-3 ${
                  selectedOp === key
                    ? 'bg-primary-600/20 glow-box'
                    : 'bg-dark-200 hover:bg-dark-100'
                }`}
              >
                <span className="text-2xl">{op.icon}</span>
                <div>
                  <p className="font-medium text-white">{op.name}</p>
                  <p className="text-gray-500 text-xs">{op.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Operation Form */}
        <div className="lg:col-span-2">
          {selectedOp ? (
            <div className="bg-dark-200 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
                  operations[selectedOp].color === 'success' ? 'bg-success/20' :
                  operations[selectedOp].color === 'warning' ? 'bg-warning/20' : 'bg-error/20'
                }`}>
                  {operations[selectedOp].icon}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">{operations[selectedOp].name}</h2>
                  <p className="text-gray-400 text-sm">{operations[selectedOp].description}</p>
                </div>
              </div>

              {/* Authority Info */}
              <div className="mb-4 bg-dark-300 rounded-lg p-3 flex items-center gap-2">
                <span className="text-gray-400 text-sm">Required Authority:</span>
                <span className="px-2 py-1 bg-primary-600/20 rounded text-primary-400 text-sm font-medium capitalize">
                  {operations[selectedOp].authorityType}
                </span>
              </div>

              <div className="space-y-4">
                {/* Mint Address (readonly) */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Mint Address</label>
                  <input
                    type="text"
                    value={mintAddress}
                    readOnly
                    className="w-full px-4 py-3 bg-dark-300 rounded-xl text-gray-400 font-mono text-sm"
                  />
                </div>

                {/* Target Address */}
                {operations[selectedOp].requiresAddress && (
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      {selectedOp.includes('blacklist') ? 'Wallet Address to Blacklist' : 'Wallet Address (ATA will be derived)'}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={targetAddress}
                        onChange={(e) => setTargetAddress(e.target.value)}
                        placeholder="Enter address..."
                        className="flex-1 px-4 py-3 bg-dark-300 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-600 font-mono text-sm"
                      />
                      {testConfig && (
                        <button
                          onClick={() => fillTestAddress('user')}
                          className="px-3 py-2 bg-primary-600/20 hover:bg-primary-600/30 rounded-xl text-primary-400 text-sm transition-colors"
                          title="Fill with test user address"
                        >
                          Fill User
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Destination Address */}
                {operations[selectedOp].requiresDestination && (
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Destination Account</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={destinationAddress}
                        onChange={(e) => setDestinationAddress(e.target.value)}
                        placeholder="Treasury account address..."
                        className="flex-1 px-4 py-3 bg-dark-300 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-600 font-mono text-sm"
                      />
                      {testConfig && (
                        <button
                          onClick={fillTreasuryAddress}
                          className="px-3 py-2 bg-primary-600/20 hover:bg-primary-600/30 rounded-xl text-primary-400 text-sm transition-colors"
                          title="Fill with treasury address"
                        >
                          Fill Treasury
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Amount */}
                {operations[selectedOp].requiresAmount && (
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Amount</label>
                    <input
                      type="text"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="Enter amount (e.g., 10.5)..."
                      className="w-full px-4 py-3 bg-dark-300 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-600"
                    />
                    <p className="text-gray-500 text-xs mt-1">Amount is in token units (6 decimals)</p>
                  </div>
                )}

                {/* Reason for blacklist */}
                {selectedOp === 'blacklist-add' && (
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Reason</label>
                    <input
                      type="text"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="e.g., OFAC sanctions match"
                      className="w-full px-4 py-3 bg-dark-300 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-600"
                    />
                  </div>
                )}

                {/* Warning for dangerous operations */}
                {['freeze', 'seize', 'blacklist-add', 'pause'].includes(selectedOp) && (
                  <div className="bg-warning/10 rounded-xl p-4 flex gap-3">
                    <span className="text-xl">⚠️</span>
                    <div>
                      <p className="text-warning font-medium text-sm">Caution</p>
                      <p className="text-gray-400 text-xs">
                        This action may have significant impact. Please verify all details before proceeding.
                      </p>
                    </div>
                  </div>
                )}

                {/* Result Display */}
                {result && (
                  <div className={`rounded-xl p-4 ${
                    result.success ? 'bg-success/10' : 'bg-error/10'
                  }`}>
                    {result.success ? (
                      <div>
                        <p className="text-success font-medium flex items-center gap-2">
                          <span>✓</span> Transaction Successful
                        </p>
                        <p className="text-gray-400 text-xs mt-2 font-mono break-all">
                          Signature: {result.signature}
                        </p>
                        {result.explorerUrl && (
                          <a
                            href={result.explorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block mt-2 text-primary-400 hover:text-primary-300 text-sm"
                          >
                            View in Explorer →
                          </a>
                        )}
                      </div>
                    ) : (
                      <div>
                        <p className="text-error font-medium">Error</p>
                        <p className="text-gray-400 text-xs mt-1">{result.error}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Submit Button */}
                <button
                  onClick={handleSubmit}
                  disabled={loading || (operations[selectedOp].requiresAddress && !targetAddress)}
                  className={`w-full py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 ${
                    operations[selectedOp].color === 'success' ? 'bg-success hover:bg-success/80' :
                    operations[selectedOp].color === 'warning' ? 'bg-warning hover:bg-warning/80' :
                    'bg-error hover:bg-error/80'
                  } disabled:opacity-50 disabled:cursor-not-allowed text-white`}
                >
                  {loading ? (
                    <>
                      <div className="spinner" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <span>{operations[selectedOp].icon}</span>
                      <span>Execute {operations[selectedOp].name}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-dark-200 rounded-2xl p-12 text-center">
              <div className="w-16 h-16 rounded-xl bg-primary-600/20 flex items-center justify-center text-3xl mx-auto mb-4">
                👆
              </div>
              <h3 className="text-lg font-medium text-white mb-2">Select an Operation</h3>
              <p className="text-gray-400">Choose an operation from the left panel to get started</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}