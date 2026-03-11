'use client';

import { FC, useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Connection, PublicKey } from '@solana/web3.js';
import { getMint, getAccount, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

// Stats Card Component
const StatsCard: FC<{
  title: string;
  value: string | number;
  subtitle?: string;
  icon: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
}> = ({ title, value, subtitle, icon, trend, trendValue }) => (
  <div className="bg-dark-200 rounded-xl p-6 card-hover glow-box">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-gray-400 text-sm mb-1">{title}</p>
        <p className="text-2xl font-bold text-white">{value}</p>
        {subtitle && <p className="text-gray-500 text-xs mt-1">{subtitle}</p>}
        {trend && (
          <p className={`text-xs mt-2 ${
            trend === 'up' ? 'text-success' : trend === 'down' ? 'text-error' : 'text-gray-400'
          }`}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trendValue}
          </p>
        )}
      </div>
      <div className="w-12 h-12 rounded-lg bg-primary-600/20 flex items-center justify-center text-2xl">
        {icon}
      </div>
    </div>
  </div>
);

// Feature Card Component
const FeatureCard: FC<{
  title: string;
  description: string;
  icon: string;
  status: 'active' | 'inactive' | 'pending';
}> = ({ title, description, icon, status }) => (
  <div className="bg-dark-200 rounded-xl p-5 card-hover">
    <div className="flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl ${
        status === 'active' ? 'bg-success/20' : status === 'pending' ? 'bg-warning/20' : 'bg-gray-700'
      }`}>
        {icon}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-white">{title}</h3>
          <span className={`w-2 h-2 rounded-full ${
            status === 'active' ? 'bg-success pulse-glow' : status === 'pending' ? 'bg-warning' : 'bg-gray-600'
          }`} />
        </div>
        <p className="text-gray-500 text-sm">{description}</p>
      </div>
    </div>
  </div>
);

// Quick Action Button
const QuickAction: FC<{
  label: string;
  icon: string;
  href: string;
  disabled?: boolean;
}> = ({ label, icon, href, disabled }) => (
  <a
    href={href}
    className={`flex flex-col items-center gap-2 p-4 rounded-xl transition-all ${
      disabled 
        ? 'bg-dark-300 opacity-50 cursor-not-allowed' 
        : 'bg-dark-200 hover:bg-primary-600/20 card-hover'
    }`}
  >
    <span className="text-2xl">{icon}</span>
    <span className="text-sm text-gray-300">{label}</span>
  </a>
);

export default function DashboardPage() {
  const { publicKey, connected } = useWallet();
  const [loading, setLoading] = useState(true);
  const [mintAddress, setMintAddress] = useState<string>('');
  const [stats, setStats] = useState({
    totalSupply: '0',
    holderCount: 0,
    paused: false,
    preset: 'SSS-2',
  });

  // Load stats from localStorage (demo purposes)
  useEffect(() => {
    const savedMint = localStorage.getItem('sss_mint_address');
    if (savedMint) {
      setMintAddress(savedMint);
      // In production, fetch actual data from chain
      setStats({
        totalSupply: '1,000,000',
        holderCount: 42,
        paused: false,
        preset: 'SSS-2',
      });
    }
    setLoading(false);
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">
          <span className="gradient-text">Dashboard</span>
        </h1>
        <p className="text-gray-400">Overview of your stablecoin operations</p>
      </div>

      {/* Connection Warning */}
      {!connected && (
        <div className="bg-warning/10 rounded-xl p-4 mb-6 flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <p className="text-warning font-medium">Wallet not connected</p>
            <p className="text-gray-400 text-sm">Connect your wallet to interact with the stablecoin</p>
          </div>
        </div>
      )}

      {/* No Stablecoin Warning */}
      {connected && !mintAddress && (
        <div className="bg-primary-600/10 rounded-xl p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary-600/20 flex items-center justify-center text-2xl">
              ✨
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-white mb-1">No Stablecoin Found</h3>
              <p className="text-gray-400 text-sm">Create your first stablecoin to get started</p>
            </div>
            <a
              href="/create"
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded-lg text-sm font-medium transition-colors"
            >
              Create Stablecoin
            </a>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard
          title="Total Supply"
          value={stats.totalSupply}
          subtitle={mintAddress ? `${mintAddress.slice(0, 8)}...${mintAddress.slice(-4)}` : 'No mint'}
          icon="💰"
          trend="up"
          trendValue="+0.1% today"
        />
        <StatsCard
          title="Holders"
          value={stats.holderCount}
          subtitle="Unique addresses"
          icon="👥"
          trend="up"
          trendValue="+3 this week"
        />
        <StatsCard
          title="Status"
          value={stats.paused ? 'Paused' : 'Active'}
          subtitle="Token operations"
          icon={stats.paused ? '⏸️' : '✅'}
        />
        <StatsCard
          title="Preset"
          value={stats.preset}
          subtitle="Configuration type"
          icon="⚙️"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Features Status */}
        <div className="lg:col-span-2">
          <h2 className="text-lg font-semibold mb-4 text-white">Features Status</h2>
          <div className="space-y-3">
            <FeatureCard
              title="Mint & Burn"
              description="Mint new tokens and burn existing ones"
              icon="🔥"
              status="active"
            />
            <FeatureCard
              title="Freeze Authority"
              description="Freeze and unfreeze token accounts"
              icon="❄️"
              status="active"
            />
            <FeatureCard
              title="Blacklist (SSS-2)"
              description="On-chain blacklist enforcement"
              icon="🚫"
              status={stats.preset === 'SSS-2' ? 'active' : 'inactive'}
            />
            <FeatureCard
              title="Transfer Hook"
              description="Validate transfers on-chain"
              icon="🪝"
              status={stats.preset === 'SSS-2' ? 'active' : 'inactive'}
            />
            <FeatureCard
              title="Permanent Delegate"
              description="Seize tokens from any account"
              icon="🔐"
              status={stats.preset === 'SSS-2' ? 'active' : 'inactive'}
            />
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-lg font-semibold mb-4 text-white">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            <QuickAction label="Mint" icon="🪙" href="/admin" disabled={!mintAddress} />
            <QuickAction label="Burn" icon="🔥" href="/admin" disabled={!mintAddress} />
            <QuickAction label="Freeze" icon="❄️" href="/admin" disabled={!mintAddress} />
            <QuickAction label="Blacklist" icon="🚫" href="/admin" disabled={!mintAddress} />
          </div>

          {/* Wallet Info */}
          {connected && publicKey && (
            <div className="mt-6 bg-dark-200 rounded-xl p-4">
              <h3 className="text-sm font-medium text-gray-400 mb-3">Connected Wallet</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Address</span>
                  <span className="text-white font-mono">
                    {publicKey.toString().slice(0, 8)}...{publicKey.toString().slice(-8)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Role</span>
                  <span className="text-primary-400">Master Authority</span>
                </div>
              </div>
            </div>
          )}

          {/* Recent Activity */}
          <div className="mt-6 bg-dark-200 rounded-xl p-4">
            <h3 className="text-sm font-medium text-gray-400 mb-3">Recent Activity</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <span className="w-8 h-8 rounded bg-success/20 flex items-center justify-center">🪙</span>
                <div className="flex-1">
                  <p className="text-white">Minted 10,000 tokens</p>
                  <p className="text-gray-500 text-xs">2 hours ago</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="w-8 h-8 rounded bg-warning/20 flex items-center justify-center">❄️</span>
                <div className="flex-1">
                  <p className="text-white">Froze account</p>
                  <p className="text-gray-500 text-xs">5 hours ago</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="w-8 h-8 rounded bg-error/20 flex items-center justify-center">🚫</span>
                <div className="flex-1">
                  <p className="text-white">Added to blacklist</p>
                  <p className="text-gray-500 text-xs">1 day ago</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}