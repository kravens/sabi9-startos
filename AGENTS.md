# Sabi9 (StartOS package)

StartOS 0.4.0 service package: Wasabi Wallet daemon 2.8.0 + Sabi9 web UI (port 55569).
Worklist: TODO.md. Keep README.md and instructions.md in step with every change.

Gotchas:
- Wasabi's Scheme `query` RPC is NOT stack-safe (crashes the daemon on coin iteration);
  the web proxy whitelist deliberately excludes it.
- gethistory heights are strings ("Mempool"); coins have no coinJoinInProgress in 2.8.0 -
  coinjoin state comes from getwalletinfo.coinjoinStatus.
- The RPC proxy must stay whitelist-based; never add key/mnemonic-revealing methods.
