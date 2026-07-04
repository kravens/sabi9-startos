# Sabi9 (StartOS package)

StartOS 0.4.0 service package: Wasabi Wallet daemon 2.8.0 + Sabi9 web UI (port 55569).
Built to the Project Structure reference; boilerplate matches Start9Labs/hello-world-startos
on SDK 1.5.3. Worklist: TODO.md. Keep README.md + instructions.md in step with every change.

Build: `npm install && make` (needs Docker + start-cli + squashfs on Linux/macOS/WSL).
`s9pk.mk` (root) is SDK plumbing — DO NOT EDIT; edit the Makefile.

Gotchas:
- `sdk.SubContainer.of(...)` is async — must be `await`ed in main.ts.
- Every `i18n('...')` string must be a numeric key in i18n/dictionaries/default.ts.
- Wasabi's Scheme `query` RPC is NOT stack-safe (crashes the daemon on coin iteration);
  the web proxy whitelist deliberately excludes it. Keep the proxy whitelist-based —
  never add key/mnemonic-revealing methods.
- gethistory heights are strings ("Mempool"); coins have no coinJoinInProgress in 2.8.0 —
  coinjoin state comes from getwalletinfo.coinjoinStatus.
- Container is Linux: wasabi-start.sh must stay LF + executable (.gitattributes enforces LF).
