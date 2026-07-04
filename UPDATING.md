# Updating

Upstream: WalletWasabi/WalletWasabi GitHub releases.
Pinned in: `Dockerfile` (`ARG WASABI_VERSION`) and `startos/versions/current.ts` (version `X.Y.Z:0`).
Asset pattern: `Wasabi-<version>-linux-{x64,arm64}.tar.gz`.

To bump: update both pins, add a new file under `startos/versions/`, move the old
current into `other` in `startos/versions/index.ts`, verify the RPC surface against
`WalletWasabi.Client/Rpc/WasabiJsonRpcService.cs` at the new tag (field names shift
between releases), and test wallet load + send + coinjoin in the UI.
