'use client';

import { FC, useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';

type Operation = 'mint' | 'burn' | 'freeze' | 'thaw' | 'blacklist-add' | 'blacklist-remove' | 'seize' | 'pause' | 'unpause';

interface OperationConfig {
  name: string;
  icon: string;
  description: string;
  requiresAmount: boolean;
  requiresAddress: boolean;
  requiresDestination: boolean;
  color: string;
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
  },
  burn: {
    name: 'Burn Tokens',
    icon: '🔥',
    description: 'Destroy tokens from an account',
    requiresAmount: true,
    requiresAddress: true,
    requiresDestination: false,
    color: 'error',
  },
  freeze: {
    name: 'Freeze Account',
    icon: '❄️',
    description: 'Freeze a token account',
    requiresAmount: false,
    requiresAddress: true,
    requiresDestination: false,
    color: 'warning',
  },
  thaw: {
    name: 'Thaw Account',
    icon: '☀️',
    description: 'Unfreeze a token account',
    requiresAmount: false,
    requiresAddress: true,
    requiresDestination: false,
    color: 'success',
  },
  'blacklist-add': {
    name: 'Add to Blacklist',
    icon: '🚫',
    description: 'Add address to blacklist (SSS-2)',
    requiresAmount: false,
    requiresAddress: true,
    requiresDestination: false,
    color: 'error',
  },
  'blacklist-remove': {
    name: 'Remove from Blacklist',
    icon: '✅',
    description: 'Remove address from blacklist',
    requiresAmount: false,
    requiresAddress: true,
    requiresDestination: false,
    color: 'success',
  },
  seize: {
    name: 'Seize Tokens',
    icon: '🔐',
    description: 'Seize tokens from an account (SSS-2)',
    requiresAmount: true,
    requiresAddress: true,
    requiresDestination: true,
    color: 'error',
  },
  pause: {
    name: 'Pause Token',
    icon: '⏸️',
    description: 'Pause all token operations',
    requiresAmount: false,
    requiresAddress: false,
    requiresDestination: false,
    color: 'warning',
  },
  unpause: {
    name: 'Unpause Token',
    icon: '▶️',
    description: 'Resume all token operations',
    requiresAmount: false,
    requiresAddress: false,
    requiresDestination: false,
    color: 'success',
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
  const [result, setResult] = useState<{ success: boolean; signature?: string; error?: string } | null>(null);

  useEffect(() => {
    // Check the new key first (from dashboard selection), then fallback to old key (from create page)
    const saved = localStorage.getItem('selectedStablecoinMint') || localStorage.getItem('sss_mint_address');
    if (saved) setMintAddress(saved);
  }, []);

  const handleSubmit = async () => {
    if (!selectedOp || !publicKey) return;
    
    setLoading(true);
    setResult(null);
    
    try {
      // Simulate transaction
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const mockSignature = '5' + Array(86).fill(0).map(() => 'abcdef1234567890'[Math.floor(Math.random() * 16)]).join('');
      
      setResult({ success: true, signature: mockSignature });
    } catch (error: any) {
      setResult({ success: false, error: error.message });
    } finally {
      setLoading(false);
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
                      {selectedOp.includes('blacklist') ? 'Address to Blacklist' : 'Token Account Address'}
                    </label>
                    <input
                      type="text"
                      value={targetAddress}
                      onChange={(e) => setTargetAddress(e.target.value)}
                      placeholder="Enter address..."
                      className="w-full px-4 py-3 bg-dark-300 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-600 font-mono text-sm"
                    />
                  </div>
                )}

                {/* Destination Address */}
                {operations[selectedOp].requiresDestination && (
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Destination Account</label>
                    <input
                      type="text"
                      value={destinationAddress}
                      onChange={(e) => setDestinationAddress(e.target.value)}
                      placeholder="Treasury account address..."
                      className="w-full px-4 py-3 bg-dark-300 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-600 font-mono text-sm"
                    />
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
                      placeholder="Enter amount..."
                      className="w-full px-4 py-3 bg-dark-300 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-600"
                    />
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
                      </div>
                    ) : (
                      <p className="text-error font-medium">Error: {result.error}</p>
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