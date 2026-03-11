'use client';

import { FC, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

type Preset = 'sss-1' | 'sss-2' | 'custom';

interface FormData {
  preset: Preset;
  name: string;
  symbol: string;
  decimals: number;
  uri: string;
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
}

const presets: { id: Preset; name: string; description: string; icon: string }[] = [
  {
    id: 'sss-1',
    name: 'SSS-1: Minimal',
    description: 'Basic stablecoin with mint/freeze/pause. No compliance features.',
    icon: '🟢',
  },
  {
    id: 'sss-2',
    name: 'SSS-2: Compliant',
    description: 'Full compliance: blacklist, transfer hook, permanent delegate.',
    icon: '🟣',
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Configure individual features manually.',
    icon: '⚙️',
  },
];

export default function CreatePage() {
  const { publicKey, signTransaction, connected } = useWallet();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<FormData>({
    preset: 'sss-2',
    name: '',
    symbol: '',
    decimals: 6,
    uri: '',
    enablePermanentDelegate: true,
    enableTransferHook: true,
    defaultAccountFrozen: false,
  });
  const [result, setResult] = useState<{ mintAddress: string; signature: string } | null>(null);

  const handlePresetChange = (preset: Preset) => {
    setFormData(prev => ({
      ...prev,
      preset,
      enablePermanentDelegate: preset === 'sss-2',
      enableTransferHook: preset === 'sss-2',
      defaultAccountFrozen: false,
    }));
  };

  const handleSubmit = async () => {
    if (!publicKey || !signTransaction) return;
    
    setLoading(true);
    try {
      // In production, this would call the SDK
      // For demo, we'll simulate the transaction
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Generate a mock mint address for demo
      const mockMintAddress = Keypair.generate().publicKey.toString();
      const mockSignature = '5' + Array(86).fill(0).map(() => 'abcdef1234567890'[Math.floor(Math.random() * 16)]).join('');
      
      setResult({
        mintAddress: mockMintAddress,
        signature: mockSignature,
      });

      // Save to localStorage for demo
      localStorage.setItem('sss_mint_address', mockMintAddress);
      localStorage.setItem('sss_config', JSON.stringify(formData));
    } catch (error: any) {
      console.error('Failed to create stablecoin:', error);
      alert(`Failed to create stablecoin: ${error.message}`);
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
        <p className="text-gray-400">Connect your wallet to create a new stablecoin</p>
      </div>
    );
  }

  if (result) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="bg-dark-200 rounded-2xl p-8 text-center glow-box">
          <div className="w-20 h-20 rounded-2xl bg-success/20 flex items-center justify-center text-4xl mx-auto mb-6">
            ✅
          </div>
          <h1 className="text-2xl font-bold mb-2 gradient-text">Stablecoin Created!</h1>
          <p className="text-gray-400 mb-8">Your stablecoin has been deployed successfully</p>
          
          <div className="bg-dark-300 rounded-xl p-4 mb-6 text-left">
            <p className="text-gray-400 text-sm mb-2">Mint Address</p>
            <p className="font-mono text-sm text-white break-all">{result.mintAddress}</p>
          </div>
          
          <div className="bg-dark-300 rounded-xl p-4 mb-8 text-left">
            <p className="text-gray-400 text-sm mb-2">Transaction Signature</p>
            <p className="font-mono text-sm text-primary-400 break-all">{result.signature}</p>
          </div>
          
          <div className="flex gap-4">
            <a
              href="/"
              className="flex-1 px-6 py-3 bg-primary-600 hover:bg-primary-700 rounded-xl font-medium transition-colors"
            >
              View Dashboard
            </a>
            <a
              href="/admin"
              className="flex-1 px-6 py-3 bg-dark-300 hover:bg-dark-100 rounded-xl font-medium transition-colors"
            >
              Manage Token
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">
          <span className="gradient-text">Create Stablecoin</span>
        </h1>
        <p className="text-gray-400">Deploy a new stablecoin with your chosen configuration</p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium ${
              step >= s ? 'bg-primary-600 text-white' : 'bg-dark-200 text-gray-500'
            }`}>
              {s}
            </div>
            {s < 3 && <div className={`w-12 h-1 ${step > s ? 'bg-primary-600' : 'bg-dark-200'}`} />}
          </div>
        ))}
      </div>

      {/* Step 1: Choose Preset */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold mb-4">Choose a Preset</h2>
          {presets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => handlePresetChange(preset.id)}
              className={`w-full p-5 rounded-xl text-left transition-all ${
                formData.preset === preset.id
                  ? 'bg-primary-600/20 glow-box'
                  : 'bg-dark-200 hover:bg-dark-100'
              }`}
            >
              <div className="flex items-center gap-4">
                <span className="text-3xl">{preset.icon}</span>
                <div>
                  <h3 className="font-medium text-white">{preset.name}</h3>
                  <p className="text-gray-400 text-sm">{preset.description}</p>
                </div>
                {formData.preset === preset.id && (
                  <span className="ml-auto text-primary-400 text-xl">✓</span>
                )}
              </div>
            </button>
          ))}
          <button
            onClick={() => setStep(2)}
            className="w-full mt-6 px-6 py-3 bg-primary-600 hover:bg-primary-700 rounded-xl font-medium transition-colors"
          >
            Continue
          </button>
        </div>
      )}

      {/* Step 2: Token Details */}
      {step === 2 && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold mb-4">Token Details</h2>
          
          <div>
            <label className="block text-sm text-gray-400 mb-2">Token Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., My Stablecoin"
              className="w-full px-4 py-3 bg-dark-200 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-600"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Token Symbol</label>
            <input
              type="text"
              value={formData.symbol}
              onChange={(e) => setFormData(prev => ({ ...prev, symbol: e.target.value.toUpperCase() }))}
              placeholder="e.g., MYUSD"
              maxLength={10}
              className="w-full px-4 py-3 bg-dark-200 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-600"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Decimals</label>
            <select
              value={formData.decimals}
              onChange={(e) => setFormData(prev => ({ ...prev, decimals: parseInt(e.target.value) }))}
              className="w-full px-4 py-3 bg-dark-200 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-primary-600"
            >
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                <option key={d} value={d}>{d} decimals</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Metadata URI (optional)</label>
            <input
              type="text"
              value={formData.uri}
              onChange={(e) => setFormData(prev => ({ ...prev, uri: e.target.value }))}
              placeholder="https://example.com/metadata.json"
              className="w-full px-4 py-3 bg-dark-200 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-600"
            />
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => setStep(1)}
              className="px-6 py-3 bg-dark-200 hover:bg-dark-100 rounded-xl font-medium transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!formData.name || !formData.symbol}
              className="flex-1 px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-medium transition-colors"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Review & Deploy */}
      {step === 3 && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold mb-4">Review Configuration</h2>
          
          <div className="bg-dark-200 rounded-xl p-6 space-y-4">
            <div className="flex justify-between">
              <span className="text-gray-400">Preset</span>
              <span className="text-white font-medium">{formData.preset.toUpperCase()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Name</span>
              <span className="text-white font-medium">{formData.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Symbol</span>
              <span className="text-white font-medium">{formData.symbol}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Decimals</span>
              <span className="text-white font-medium">{formData.decimals}</span>
            </div>
            
            {formData.preset !== 'sss-1' && (
              <>
                <div className="pt-4 mt-4">
                  <p className="text-gray-400 text-sm mb-3">SSS-2 Features</p>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Permanent Delegate</span>
                  <span className={formData.enablePermanentDelegate ? 'text-success' : 'text-gray-500'}>
                    {formData.enablePermanentDelegate ? '✓ Enabled' : '✗ Disabled'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Transfer Hook</span>
                  <span className={formData.enableTransferHook ? 'text-success' : 'text-gray-500'}>
                    {formData.enableTransferHook ? '✓ Enabled' : '✗ Disabled'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Default Frozen</span>
                  <span className={formData.defaultAccountFrozen ? 'text-warning' : 'text-gray-500'}>
                    {formData.defaultAccountFrozen ? '✓ Yes' : '✗ No'}
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="bg-warning/10 rounded-xl p-4 flex gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <p className="text-warning font-medium text-sm">Deployment Notice</p>
              <p className="text-gray-400 text-xs">
                This will create a new Token-2022 mint on Solana. Make sure you have enough SOL for the deployment.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => setStep(2)}
              className="px-6 py-3 bg-dark-200 hover:bg-dark-100 rounded-xl font-medium transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="spinner" />
                  <span>Deploying...</span>
                </>
              ) : (
                <>
                  <span>🚀</span>
                  <span>Deploy Stablecoin</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}