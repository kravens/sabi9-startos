import { VersionInfo, IMPOSSIBLE } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '2.8.0:9',
  releaseNotes: {
    en_US:
      'Wallet lifecycle (create / recover / import + restore of ColdCard & SeedSigner and ⇓ ' +
      'wallet-file backups), password-free wallet switching with a per-wallet balance sidebar ' +
      'and total, Bitcoin / Coordinator / Privacy settings (coordinator picker, optional Bitcoin ' +
      'Core RPC backend, network selector, gap limit, anonymity target), in-app full service ' +
      'restart, coinjoin blocked on watch-only wallets, and a clear wallet-loading screen. ' +
      'Restoring a wallet file rescans from its birth height so history rebuilds; the wallet ' +
      'password is asked on every spend/coinjoin and never cached. Installs as an in-place ' +
      'update - filters and wallets are preserved.\n\n' +
      'Which file to download: sabi9_x86_64.s9pk for Intel/AMD servers (Start9 Server Pure/Pro, ' +
      'x86 mini-PCs, x86 VMs); sabi9_aarch64.s9pk for ARM64 boards (Raspberry Pi 4/5, Embassy ' +
      'One). Not sure? StartOS -> System -> About, or run uname -m over SSH (x86_64 / aarch64).',
  },
  migrations: {
    up: async ({ effects }) => {},
    down: IMPOSSIBLE,
  },
})
