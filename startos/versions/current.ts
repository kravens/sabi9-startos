import { VersionInfo, IMPOSSIBLE } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '2.8.0:18',
  releaseNotes: {
    en_US:
      'v1.0 - first stable release, end-to-end tested on mainnet (no longer alpha).\n\n' +
      'Batched payments: Send now takes multiple recipients in one transaction ' +
      '(+ Add recipient). Change-avoidance suggestions apply to single-recipient sends; ' +
      'manual coin selection works for both.\n\n' +
      'Coins view now shows each coin’s receive address (click to copy) and lets you edit ' +
      'coin/address labels inline (Save restarts the service; Wasabi has no live label RPC).\n\n' +
      'Transaction details (click any history row), an All / ◆ Coinjoins filter on the ' +
      'transaction list, and manual coin selection on send (Preview → choose coins) to ' +
      'override the private-first auto-pick.\n\n' +
      'New Coins view (⛃ Coins, top-right): per-coin anonymity, labels, confirmations, and ' +
      'freeze/unfreeze to keep a coin out of coinjoin (Wasabi exclude-from-coinjoin). Frozen ' +
      'coins are skipped by the private-first send picker.\n\n' +
      'Faster wallet view: the poll now fires independent daemon reads (status, wallet ' +
      'list, coins, history, fee rates, and every sidebar balance) in parallel instead ' +
      'of one after another.\n\n' +
      'New Wallet options menu (top-right): wallet info from the daemon (balance, coin and ' +
      'transaction counts, coinjoin status, anonymity target, master fingerprint, segwit + ' +
      'taproot account xpubs), the wallet-file backup, and Delete Wallet (backup-first, then ' +
      'type-to-confirm; the service restarts to clear the deleted wallet).\n\n' +
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
