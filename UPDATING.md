# Updating

## Upstream: Wasabi Wallet daemon
GitHub releases of `WalletWasabi/WalletWasabi`.
- Pinned in `Dockerfile` (`ARG WASABI_VERSION`) and `startos/versions/current.ts` (`version: 'X.Y.Z:0'`).
- Asset: `Wasabi-<version>-linux-{x64,arm64}.tar.gz`; top dir `WasabiWallet/`, daemon `wassabeed`.
- On bump: update both pins, add a new `startos/versions/vX.Y.Z_0.ts`, move the
  previous current into `other` in `startos/versions/index.ts`, and re-verify the
  RPC surface against `WalletWasabi.Client/Rpc/WasabiJsonRpcService.cs` at the new
  tag (field names shift between releases). Retest load + send + coinjoin.

## Toolchain: Start9 SDK
- `@start9labs/start-sdk` pinned in `package.json` (currently **1.5.3**).
- `s9pk.mk` at repo root is SDK-provided plumbing (matches the pinned SDK); refresh
  it from a freshly scaffolded package if you bump the SDK major/minor.
