# Sabi9

Wasabi Wallet on your own node: the headless Wasabi daemon (v2.8.0) plus a web
interface styled after Wasabi Desktop. This page mirrors Wasabi's own
[ELI5 guide](https://docs.wasabiwallet.io/using-wasabi/ELI5.html) - everything
there applies here, only "installing Wasabi" is replaced by installing this
service.

## Installing (instead of "Installing Wasabi")

1. Install and **start the service**. The Wasabi daemon bootstraps Tor and
   begins syncing BIP-158 block filters over P2P - the **Wasabi Daemon** health
   check turns green when its RPC is up (first boot takes a few minutes).
2. Open the **Sabi9 Web Interface**. With no wallets on the daemon yet you land
   on a welcome screen that walks through the flow below.

## Generating a wallet

1. **＋ Create a new wallet** - pick a unique name and a very secure password.
2. Your **recovery words** are shown **once**. Write them down on paper,
   **in the correct order**.
3. The password is not just a lock: it is **part of the wallet itself**.
   Restoring ever needs the recovery words **and** this exact password -
   a different password opens a different (empty) wallet, with no error shown.
4. Store the recovery words and the password **in separate places**, both on
   paper. Anyone holding both can take your coins.

To restore instead: **⟳ Recover from backup** - wallet name, the 12-24 words,
and the **original** password.

Wallets live in the left sidebar and stay **locked** until you open them; the
password you enter is kept for the session only and pre-fills spend actions.

## Receiving bitcoin

**Receive** → enter a label naming **the observers - everyone who will know
this address is yours** (e.g. "alice", who repays you for pizza) → a fresh
address appears with a QR code to scan. One address, one use - it is never
shown again. Wasabi uses these labels to warn you later, before a spend links
people together.

## Coinjoining

Press **▶ on the music box** at the bottom of the screen. Your coins are mixed
with everyone else's until each reaches your anonymity target, then it stops by
itself. The **PRIVACY PROGRESS** card shows how far along you are; the
**PRIVATE** amount is what you can already spend without history attached. The
Wasabi "W" breathes green while mixing.

- **⋯** on the music box opens the full coinjoin options: continuous mixing,
  **sweep via coinjoin** into another wallet, and **payments inside coinjoin**.
- Wasabi ships **without a coinjoin coordinator** - you choose one you trust in
  **Settings ⚙** (presets and a live list are offered). The coordinator batches
  rounds and sets the coordination fee; it can never steal funds. After saving,
  restart the service - the daemon reads its config at startup.

## Sending bitcoin

1. **Send** - address, amount, and the recipient's name as label.
2. **Preview Transaction** shows the fee and privacy warnings (non-private
   coins, label interlinking, change creation) plus **Change Avoidance**
   suggestions: send slightly more or less so the transaction consumes its
   coins exactly and creates **no change output**. Optional - use it when the
   receiver accepts a slightly different amount.
3. Confirm with your wallet password.

Pending transactions show ⚡ (speed up, RBF/CPFP) and ✕ (cancel) in the history.

## Cold wallets (ColdCard / SeedSigner, fully offline)

Following Wasabi's
[ColdWasabi guide](https://docs.wasabiwallet.io/using-wasabi/ColdWasabi.html):
**＋ Add wallet → Import hardware wallet**. On a ColdCard run *Advanced →
Export Wallet → Wasabi Wallet* and carry the skeleton file over by **SD card**
(drag & drop it, or paste the JSON); from a SeedSigner paste the account
**xpub/zpub** and master fingerprint it displays. The device never touches a
network - the server gets a **watch-only** wallet (◇ badge) that tracks
balances and generates receive addresses but holds no keys and cannot spend.
Signing stays on the hardware device.

## Optional: Bitcoin Core backend

If Bitcoin Core runs on this node, **Settings ⚙ → Bitcoin Core RPC** can point
the daemon at it (a **Detect bitcoind** probe is built in) so blocks and
filters come from your own node instead of public P2P peers. Leave empty to
keep P2P syncing.

## Privacy notes

- Your keys, coins and history stay on this device. The wallet syncs privately
  over Tor + P2P block filters; no third-party server learns your addresses.
- The daemon's JSON-RPC is bound to loopback inside the container and is only
  reachable through this service's web interface.
- Anyone who can open the web interface can operate the wallet UI, but
  **spending and coinjoins always require your wallet password**, which is
  never stored on disk.
- **Discreet mode** (◎ in the sidebar) blurs all amounts for screen sharing.

## Backups

> ### ⚠ Uninstalling this service DELETES your wallet files
>
> StartOS removes a service's data volume on uninstall. Every wallet on this
> daemon - including watch-only imports - is deleted with it. **Before
> uninstalling, make a StartOS backup or download your wallet files.**

Three layers, strongest first:

1. **StartOS backup** (System → Backups) - includes the full Wasabi data
   directory: all wallet files, labels, anonymity metadata, configuration.
   Reinstall + *Restore from backup* brings everything back exactly.
2. **Wallet file download** - the **⇓ button** next to Send/Receive saves the
   open wallet's `.json` to your computer. It contains your address labels and
   anonymity scores plus the password-encrypted secret (hot wallets) or just
   the xpub (watch-only) - the same file Wasabi Desktop backs up. Store it
   like cash.
3. **Recovery words + password** - restore your *funds* anywhere, but **not**
   your labels or anonymity metadata: the restored wallet no longer knows
   which coins were coinjoined or who knows which address. Privacy-relevant -
   prefer 1 or 2.
