# Sabi9 · Wasabi Wallet for StartOS

Wraps the headless **Wasabi Wallet daemon 2.8.0** for StartOS 0.4.0 and adds
**Sabi9**, a web-native interface styled after Wasabi Desktop - the browser
sibling of [`sabi.py`](https://github.com/kravens/coinjoin.nl/blob/main/scripts/sabi.py).

```
┌────────────────────────── StartOS service ──────────────────────────┐
│  daemon "wasabi"  wassabeed (Tor + P2P block-filter sync, RPC on    │
│                   127.0.0.1:37128 - never leaves the container)     │
│  daemon "web"     sabi9d.py - serves the UI on :55569 and proxies   │
│                   a whitelisted set of RPC methods to the daemon    │
└──────────────────────────────────────────────────────────────────────┘
```

## What the package adds vs upstream

- Web UI (port **55569**, mouse-first, Wasabi Desktop styling): balance /
  privacy-progress / exchange-rate cards, transaction list, send with
  **Preview Transaction** (warnings + **Change Avoidance** no-change
  suggestions), receive with QR, coinjoin "music box" bar, discreet mode.
- JSON-RPC enabled automatically on first boot (loopback only), config kept in
  the `main` volume and respected if you edit it.
- RPC proxy whitelists wallet methods; nothing that could exfiltrate keys.
- Both daemons supervised by StartOS with health checks (RPC port, UI port).

## Building

```bash
npm install        # pulls @start9labs/start-sdk (provides s9pk.mk for make)
make               # builds sabi9.s9pk (docker build of ./Dockerfile for x86_64 + aarch64)
start-cli package install sabi9.s9pk
```

The Docker image downloads the official self-contained Wasabi release
(`Wasabi-2.8.0-linux-{x64,arm64}.tar.gz`) at build time - see `UPDATING.md`
for bumping the version.

## Development

- `web/sabi9d.py` - stdlib-only web daemon (static files, `/rpc` proxy,
  `/qr` SVG generator, `/health`).
- `web/static/` - the UI (vanilla HTML/CSS/JS, no build step).
  Open `index.html?demo=1` in a browser to preview with fake data, no daemon
  needed.
- `startos/` - StartOS 0.4.0 SDK wiring (manifest, main, interfaces, versions).

## Security model

The web UI is only reachable through the interfaces StartOS exposes (LAN
`.local` / Tor). The UI itself is unauthenticated, but every spending or
coinjoin action requires the wallet password, which is prompted per action and
never stored. The daemon RPC is not exposed outside the container.
