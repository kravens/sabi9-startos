# Sabi9 · Wasabi Wallet for StartOS — ⚠️ ALPHA (pre-release)

> **Alpha / pre-release.** Under active development and not yet audited or
> submitted to the community registry. Test on a throwaway/regtest wallet or
> small amounts only. Expect breaking changes.

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

## Which build do I download?

Releases ship two `.s9pk` files — pick the one for your server's processor:

| File | Processor | Hardware |
| --- | --- | --- |
| `sabi9_x86_64.s9pk` | Intel / AMD | Start9 **Server Pure / Server Pro**, x86 mini-PCs, x86 VMs |
| `sabi9_aarch64.s9pk` | ARM64 | **Raspberry Pi 4/5**, **Embassy One**, other ARM64 boards |

Not sure which you have? **StartOS → System → About**, or run `uname -m` over SSH
(`x86_64` or `aarch64`). Installing from a marketplace/registry picks the arch
automatically; the choice only matters when downloading a `.s9pk` by hand.

## Building a community package (.s9pk)

Requires a Linux/macOS box with the Start9 toolchain (Docker, make, Node 22,
`squashfs-tools`, `start-cli` — see the
[Environment Setup](https://docs.start9.com/packaging/0.4.0.x/environment-setup.html)).

The recommended, tool-blessed way is to build inside a Start9 workspace:

```bash
# one-time: create an AI-ready packaging workspace (holds your signing key + host/registry config)
start-cli s9pk init-workspace my-workspace
cd my-workspace
git clone https://github.com/kravens/sabi9-startos
cd sabi9-startos

npm install        # pulls @start9labs/start-sdk (provides s9pk.mk for make)
make               # -> sabi9_x86_64.s9pk and sabi9_aarch64.s9pk (docker build of ./Dockerfile)
make install       # optional: sideload to the box in ~/.startos/config.yaml
```

Distribute the resulting `.s9pk` for sideloading (**System → Sideload** in
StartOS), or publish it to a community registry with the included GitHub
Actions workflows (`.github/workflows/`, which delegate to Start9's reusable
CI). The Docker image downloads the official self-contained Wasabi release
(`Wasabi-2.8.0-linux-{x64,arm64}.tar.gz`) at build time — see `UPDATING.md`
for bumping the version.

CI is active but needs repo config to go green: secret `DEV_KEY` (the
`start-cli` developer signing key) for builds, and — for the publish job —
variables `REFERENCE_REGISTRY` / `RELEASE_REGISTRY` / `S3_S9PKS_BASE_URL`
plus secrets `S3_ACCESS_KEY` / `S3_SECRET_KEY`. Without these, `Build` (on
PRs) and `Tag and Release` (on push to `master`) fail at the signing /
registry step — expected until a registry is wired up.

> This repo was authored by hand against the
> [Project Structure](https://docs.start9.com/packaging/0.4.0.x/project-structure.html)
> reference (the scaffolder `start-cli s9pk init-package` is Linux/macOS-only).
> It matches the documented layout; if you prefer, scaffold a fresh package
> with `init-package` and drop in `startos/`, `web/`, `Dockerfile` and
> `wasabi-start.sh` from here.

## Development

- `web/sabi9d.py` - stdlib-only web daemon (static files, `/rpc` proxy,
  `/qr` SVG generator, `/health`).
- `web/static/` - the UI (vanilla HTML/CSS/JS, no build step).
  Open `index.html?demo=1` in a browser to preview with fake data, no daemon
  needed.
- `startos/` - StartOS 0.4.0 SDK wiring (manifest, main, interfaces, versions).

## ⚠ Uninstalling deletes your wallets

StartOS removes a service's data volume on uninstall: every wallet file on the
daemon goes with it. Updates and reinstalls over a *higher package revision*
keep the data. Before uninstalling, make a **StartOS backup** — it snapshots
the whole data dir (wallets, labels, anonymity metadata, **transaction store
and filter index**) and restores **instantly, with no re-scan**. The UI's **⇓
wallet-file download** backs up keys + labels only, so restoring it rebuilds
history by re-scanning the chain. Recovery words + password restore funds but
not labels/privacy metadata (also re-scans).

## Security model

The web UI is only reachable through the interfaces StartOS exposes (LAN
`.local` / Tor). The UI itself is unauthenticated, but every spending or
coinjoin action requires the wallet password, which is prompted per action and
never stored. The daemon RPC is not exposed outside the container.
