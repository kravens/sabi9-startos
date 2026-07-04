# Sabi9

Wasabi Wallet on your own node: the headless Wasabi daemon (v2.8.0) plus a web
interface styled after Wasabi Desktop.

## First start

1. Start the service. The Wasabi daemon bootstraps Tor and begins syncing
   BIP-158 block filters over P2P - the **Wasabi Daemon** health check turns
   green when the RPC is up (first boot can take a few minutes).
2. Open the **Sabi9 Web Interface**.
3. Pick a wallet, or create/recover one from the wallet screen. After loading,
   the wallet matches block filters against your keys and downloads matched
   blocks from P2P peers - balances and history appear when that finishes
   (minutes for old or busy wallets; the UI shows a syncing banner).

## Using it

- **Send** - fill address, amount and label, then *Preview Transaction*. The
  preview shows warnings (non-private coins, label interlinking, change
  creation) and **Change Avoidance** suggestions: send slightly more or less so
  the transaction consumes its coins exactly and creates **no change output**.
  Always optional - only use it when the receiver accepts a slightly different
  amount.
- **Receive** - enter a label (Wasabi requires one), get a fresh address with a
  QR code. One address, one use.
- **Coinjoin** - start/stop from the dialog or the bar at the bottom. The
  Wasabi "W" breathes green while your coins are mixing. Mixing continues
  until everything reaches your anonymity target, then stops.
- **Discreet mode** - the eye button in the sidebar blurs all amounts and
  addresses for screen sharing.

## Privacy notes

- Your keys, coins and history stay on this device. The wallet syncs privately
  over Tor + P2P block filters; no third-party server learns your addresses.
- The daemon's JSON-RPC is bound to loopback inside the container and is only
  reachable through this service's web interface.
- Anyone who can open the web interface can operate the wallet UI, but
  **spending and coinjoins always require your wallet password**, which is
  never stored.

## Backups

StartOS backups include the full Wasabi data directory (wallet files and
configuration). Your recovery words remain the ultimate backup - store them on
paper.
