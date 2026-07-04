import { sdk } from './sdk'

// No hard dependencies: the Wasabi daemon syncs privately over P2P block filters
// (BIP-158) and does not require a local Bitcoin node. A future version may add an
// optional dependency on bitcoind for block download via local RPC.
export const setDependencies = sdk.setupDependencies(async () => ({}))
