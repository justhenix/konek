import { useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

export default function WalletConnectTest() {
  const { publicKey, connected } = useWallet();

  useEffect(() => {
    if (connected && publicKey) {
      console.log('Wallet connected:', publicKey.toBase58());
    }
  }, [connected, publicKey]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <WalletMultiButton />
      {connected && publicKey && (
        <span
          style={{
            fontSize: '12px',
            fontFamily: 'monospace',
            color: '#04fa3a',
            fontWeight: 700,
          }}
        >
          {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
        </span>
      )}
    </div>
  );
}
