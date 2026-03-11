import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { WalletProvider } from '@/components/WalletProvider';
import { Navigation } from '@/components/Navigation';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'SSS Token - Solana Stablecoin Standard',
  description: 'Create and manage compliant stablecoins on Solana',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-dark-300 text-white antialiased`}>
        <WalletProvider>
          <Navigation />
          <main className="pt-20 min-h-screen">
            {children}
          </main>
        </WalletProvider>
      </body>
    </html>
  );
}