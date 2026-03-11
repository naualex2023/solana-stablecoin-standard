'use client';

import { FC } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useStablecoins, useSelectedStablecoin } from '@/hooks/useStablecoins';
import { formatSupply } from '@/lib/fetch-stablecoins';
import { StablecoinWithSupply } from '@/lib/types';

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

// Stablecoin List Item
const StablecoinItem: FC<{
  coin: StablecoinWithSupply;
  isSelected: boolean;
  onSelect: () => void;
}> = ({ coin, isSelected, onSelect }) => (
  <button
    onClick={onSelect}
    className={`w-full text-left p-4 rounded-xl transition-all ${
      isSelected 
        ? 'bg-primary-600/30 ring-2 ring-primary-500' 
        : 'bg-dark-200 hover:bg-dark-300'
    }`}
  >
    <div className="flex items-center justify-between">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-white">{coin.name}</h3>
          <span className="px-2 py-0.5 text-xs rounded bg-primary-600/30 text-primary-300">
            {coin.symbol}
          </span>
          {coin.paused && (
            <span className="px-2 py-0.5 text-xs rounded bg-warning/30 text-warning">
              Paused
            </span>
          )}
        </div>
        <p className="text-gray-500 text-xs mt-1 font-mono">
          {coin.mint.slice(0, 8)}...{coin.mint.slice(-8)}
        </p>
      </div>
      <div className="text-right">
        <p className="text-white font-medium">{formatSupply(coin.supply, coin.decimals)}</p>
        <p className="text-gray-500 text-xs">Supply</p>
      </div>
    </div>
  </button>
);

export default function DashboardPage() {
  const { publicKey, connected } = useWallet();
  const { stablecoins, loading, error, refetch } = useStablecoins();
  const { selected, selectStablecoin } = useSelectedStablecoin();

  // Determine preset based on features
  const getPreset = (coin: StablecoinWithSupply) => {
    if (coin.enableTransferHook && coin.enablePermanentDelegate) {
      return 'SSS-2';
    }
    return 'SSS-1';
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">
            <span className="gradient-text">Dashboard</span>
          </h1>
          <p className="text-gray-400">Overview of your stablecoin operations</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={loading}
          className="px-4 py-2 bg-dark-200 hover:bg-dark-300 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          <span className={loading ? 'animate-spin' : ''}>🔄</span>
          Refresh
        </button>
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

      {/* Error Message */}
      {error && (
        <div className="bg-error/10 rounded-xl p-4 mb-6 flex items-center gap-3">
          <span className="text-2xl">❌</span>
          <div>
            <p className="text-error font-medium">Failed to load stablecoins</p>
            <p className="text-gray-400 text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin text-4xl">⏳</div>
          <p className="ml-4 text-gray-400">Loading stablecoins from devnet...</p>
        </div>
      )}

      {/* No Stablecoins Found */}
      {!loading && stablecoins.length === 0 && !error && (
        <div className="bg-primary-600/10 rounded-xl p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary-600/20 flex items-center justify-center text-2xl">
              ✨
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-white mb-1">No Stablecoins Found</h3>
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

      {/* Stablecoins List */}
      {!loading && stablecoins.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Stablecoin Selector */}
          <div className="lg:col-span-1">
            <h2 className="text-lg font-semibold mb-4 text-white flex items-center gap-2">
              <span>🪙</span>
              Stablecoins ({stablecoins.length})
            </h2>
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {stablecoins.map((coin) => (
                <StablecoinItem
                  key={coin.mint}
                  coin={coin}
                  isSelected={selected?.mint === coin.mint}
                  onSelect={() => selectStablecoin(coin)}
                />
              ))}
            </div>
          </div>

          {/* Selected Stablecoin Details */}
          <div className="lg:col-span-2">
            {selected ? (
              <>
                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <StatsCard
                    title="Total Supply"
                    value={formatSupply(selected.supply, selected.decimals)}
                    subtitle={selected.symbol}
                    icon="💰"
                  />
                  <StatsCard
                    title="Decimals"
                    value={selected.decimals}
                    subtitle="Token precision"
                    icon="🔢"
                  />
                  <StatsCard
                    title="Status"
                    value={selected.paused ? 'Paused' : 'Active'}
                    subtitle="Token operations"
                    icon={selected.paused ? '⏸️' : '✅'}
                  />
                  <StatsCard
                    title="Preset"
                    value={getPreset(selected)}
                    subtitle="Configuration"
                    icon="⚙️"
                  />
                </div>

                {/* Features Status */}
                <h2 className="text-lg font-semibold mb-4 text-white">Features Status</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
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
                    status={selected.defaultAccountFrozen ? 'active' : 'active'}
                  />
                  <FeatureCard
                    title="Blacklist (SSS-2)"
                    description="On-chain blacklist enforcement"
                    icon="🚫"
                    status={selected.enableTransferHook ? 'active' : 'inactive'}
                  />
                  <FeatureCard
                    title="Transfer Hook"
                    description="Validate transfers on-chain"
                    icon="🪝"
                    status={selected.enableTransferHook ? 'active' : 'inactive'}
                  />
                  <FeatureCard
                    title="Permanent Delegate"
                    description="Seize tokens from any account"
                    icon="🔐"
                    status={selected.enablePermanentDelegate ? 'active' : 'inactive'}
                  />
                </div>

                {/* Quick Actions */}
                <h2 className="text-lg font-semibold mb-4 text-white">Quick Actions</h2>
                <div className="grid grid-cols-4 gap-3">
                  <QuickAction label="Mint" icon="🪙" href="/admin" />
                  <QuickAction label="Burn" icon="🔥" href="/admin" />
                  <QuickAction label="Freeze" icon="❄️" href="/admin" />
                  <QuickAction label="Blacklist" icon="🚫" href="/admin" disabled={!selected.enableTransferHook} />
                </div>

                {/* Config Details */}
                <div className="mt-6 bg-dark-200 rounded-xl p-4">
                  <h3 className="text-sm font-medium text-gray-400 mb-3">Configuration</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Config Address</span>
                      <p className="text-white font-mono text-xs mt-1">
                        {selected.address.slice(0, 20)}...
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500">Mint Address</span>
                      <p className="text-white font-mono text-xs mt-1">
                        {selected.mint.slice(0, 20)}...
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500">Master Authority</span>
                      <p className="text-white font-mono text-xs mt-1">
                        {selected.masterAuthority.slice(0, 20)}...
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500">Explorer</span>
                      <a 
                        href={`https://explorer.solana.com/address/${selected.mint}?cluster=devnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-400 hover:text-primary-300 text-xs"
                      >
                        View on Solana Explorer →
                      </a>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-dark-200 rounded-xl p-12 text-center">
                <div className="text-4xl mb-4">👈</div>
                <h3 className="text-lg font-medium text-white mb-2">Select a Stablecoin</h3>
                <p className="text-gray-400">Choose a stablecoin from the list to view details</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Wallet Info (when connected) */}
      {connected && publicKey && (
        <div className="mt-8 bg-dark-200 rounded-xl p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Connected Wallet</h3>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary-600/20 flex items-center justify-center">
                👛
              </div>
              <div>
                <p className="text-white font-mono">
                  {publicKey.toString().slice(0, 8)}...{publicKey.toString().slice(-8)}
                </p>
                <p className="text-gray-500 text-xs">Connected</p>
              </div>
            </div>
            <a
              href={`/admin`}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded-lg text-sm font-medium transition-colors"
            >
              Admin Panel →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}