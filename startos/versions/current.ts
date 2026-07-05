import { VersionInfo, IMPOSSIBLE } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '2.8.0:6',
  releaseNotes: {
    en_US:
      'Wallet lifecycle (create / recover / import + restore of ColdCard & SeedSigner and ⇓ ' +
      'wallet-file backups), sidebar wallet list with per-wallet unlock, Bitcoin / Coordinator / ' +
      'Privacy settings (coordinator picker, optional Bitcoin Core RPC backend, anonymity target), ' +
      'in-app full service restart, coinjoin blocked on watch-only wallets, and a clear ' +
      'wallet-loading screen. Restoring a wallet file now rescans from its birth height so ' +
      'the transaction history rebuilds. Installs as an in-place update - filters and wallets ' +
      'are preserved.',
  },
  migrations: {
    up: async ({ effects }) => {},
    down: IMPOSSIBLE,
  },
})
