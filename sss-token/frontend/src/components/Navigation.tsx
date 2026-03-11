'use client';

import { FC } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: '📊' },
  { label: 'Create', href: '/create', icon: '✨' },
  { label: 'Admin', href: '/admin', icon: '⚙️' },
  { label: 'Holders', href: '/holders', icon: '👥' },
];

export const Navigation: FC = () => {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-dark-300/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
              <span className="text-xl">💎</span>
            </div>
            <div>
              <h1 className="text-lg font-bold gradient-text">SSS Token</h1>
              <p className="text-xs text-gray-500">Stablecoin Standard</p>
            </div>
          </Link>

          {/* Navigation Links */}
          <div className="flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
                    flex items-center gap-2
                    ${isActive 
                      ? 'bg-primary-600/20 text-primary-300' 
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }
                  `}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Wallet Button */}
          <div className="flex items-center gap-4">
            <WalletMultiButton className="!bg-primary-600 hover:!bg-primary-700 !rounded-lg !text-sm !font-medium !py-2 !px-4" />
          </div>
        </div>
      </div>
    </nav>
  );
};