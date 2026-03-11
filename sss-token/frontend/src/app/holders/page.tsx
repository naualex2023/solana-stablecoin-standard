'use client';

import { FC, useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';

interface Holder {
  address: string;
  balance: string;
  percentage: string;
  status: 'active' | 'frozen' | 'blacklisted';
}

// Mock data for demonstration
const mockHolders: Holder[] = [
  { address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', balance: '500,000', percentage: '50%', status: 'active' },
  { address: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', balance: '250,000', percentage: '25%', status: 'active' },
  { address: '2wmVCSfPxGPjrnMMn7rchJ4Y2bwn2cn8qXjNFRqBQFJx', balance: '100,000', percentage: '10%', status: 'frozen' },
  { address: '98wPJ7X5s6dE3nVQCTrEwZdXcFzGhLdHsNBLh1rTmKp', balance: '75,000', percentage: '7.5%', status: 'active' },
  { address: 'Dp4LQM8LKw7GyJBN6cW3dT6F3pFCxQxD5JXbqT5qCvJm', balance: '50,000', percentage: '5%', status: 'blacklisted' },
  { address: 'HvLvbKbmYpYL6WJLGEbZqxsGd9cJhF3NpQ7T2kR8VxWc', balance: '25,000', percentage: '2.5%', status: 'active' },
];

export default function HoldersPage() {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const [mintAddress, setMintAddress] = useState<string>('');
  const [holders, setHolders] = useState<Holder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => {
    const saved = localStorage.getItem('sss_mint_address');
    if (saved) {
      setMintAddress(saved);
      // In production, fetch actual holders from chain/indexer
      setHolders(mockHolders);
    }
    setLoading(false);
  }, []);

  const filteredHolders = holders.filter(holder => {
    const matchesSearch = holder.address.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || holder.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  if (!connected) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <div className="w-20 h-20 rounded-2xl bg-primary-600/20 flex items-center justify-center text-4xl mx-auto mb-6">
          🔒
        </div>
        <h1 className="text-2xl font-bold mb-4">Connect Your Wallet</h1>
        <p className="text-gray-400">Connect your wallet to view token holders</p>
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
        <p className="text-gray-400 mb-6">Create a stablecoin first to view holders</p>
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
          <span className="gradient-text">Token Holders</span>
        </h1>
        <p className="text-gray-400">View and manage token holder accounts</p>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-dark-200 rounded-xl p-4">
          <p className="text-gray-400 text-sm">Total Holders</p>
          <p className="text-2xl font-bold text-white">{holders.length}</p>
        </div>
        <div className="bg-dark-200 rounded-xl p-4">
          <p className="text-gray-400 text-sm">Active</p>
          <p className="text-2xl font-bold text-success">{holders.filter(h => h.status === 'active').length}</p>
        </div>
        <div className="bg-dark-200 rounded-xl p-4">
          <p className="text-gray-400 text-sm">Frozen</p>
          <p className="text-2xl font-bold text-warning">{holders.filter(h => h.status === 'frozen').length}</p>
        </div>
        <div className="bg-dark-200 rounded-xl p-4">
          <p className="text-gray-400 text-sm">Blacklisted</p>
          <p className="text-2xl font-bold text-error">{holders.filter(h => h.status === 'blacklisted').length}</p>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex-1">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by address..."
            className="w-full px-4 py-3 bg-dark-200 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-600"
          />
        </div>
        <div className="flex gap-2">
          {['all', 'active', 'frozen', 'blacklisted'].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                filterStatus === status
                  ? 'bg-primary-600 text-white'
                  : 'bg-dark-200 text-gray-400 hover:text-white'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Holders Table */}
      <div className="bg-dark-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-dark-300">
                <th className="text-left px-6 py-4 text-gray-400 text-sm font-medium">Address</th>
                <th className="text-right px-6 py-4 text-gray-400 text-sm font-medium">Balance</th>
                <th className="text-right px-6 py-4 text-gray-400 text-sm font-medium">Share</th>
                <th className="text-center px-6 py-4 text-gray-400 text-sm font-medium">Status</th>
                <th className="text-center px-6 py-4 text-gray-400 text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredHolders.map((holder, index) => (
                <tr key={holder.address} className="hover:bg-dark-300/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary-600/20 flex items-center justify-center text-sm">
                        👤
                      </div>
                      <span className="font-mono text-sm text-white">
                        {holder.address.slice(0, 8)}...{holder.address.slice(-8)}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right text-white font-medium">{holder.balance}</td>
                  <td className="px-6 py-4 text-right text-gray-400">{holder.percentage}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${
                      holder.status === 'active' ? 'bg-success/20 text-success' :
                      holder.status === 'frozen' ? 'bg-warning/20 text-warning' :
                      'bg-error/20 text-error'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        holder.status === 'active' ? 'bg-success' :
                        holder.status === 'frozen' ? 'bg-warning' :
                        'bg-error'
                      }`} />
                      {holder.status.charAt(0).toUpperCase() + holder.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        className="p-2 rounded-lg bg-dark-100 hover:bg-primary-600/20 transition-colors text-gray-400 hover:text-primary-400"
                        title="View on Explorer"
                      >
                        🔍
                      </button>
                      {holder.status === 'active' && (
                        <button
                          className="p-2 rounded-lg bg-dark-100 hover:bg-warning/20 transition-colors text-gray-400 hover:text-warning"
                          title="Freeze Account"
                        >
                          ❄️
                        </button>
                      )}
                      {holder.status === 'frozen' && (
                        <button
                          className="p-2 rounded-lg bg-dark-100 hover:bg-success/20 transition-colors text-gray-400 hover:text-success"
                          title="Thaw Account"
                        >
                          ☀️
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredHolders.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400">No holders found matching your criteria</p>
          </div>
        )}
      </div>

      {/* Info Note */}
      <div className="mt-6 bg-primary-600/10 rounded-xl p-4 flex gap-3">
        <span className="text-xl">ℹ️</span>
        <div>
          <p className="text-primary-400 font-medium text-sm">Token Holder Data</p>
          <p className="text-gray-400 text-xs">
            For production use, holder data should be fetched from an indexer service or specialized RPC provider (Helius, QuickNode).
            The current display shows mock data for demonstration purposes.
          </p>
        </div>
      </div>
    </div>
  );
}