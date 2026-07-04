import { sdk } from './sdk'

// No hard dependencies: the Wasabi daemon syncs privately over P2P block filters
// (BIP-158) and does not require a local Bitcoin node.
export const setDependencies = sdk.setupDependencies(
  async ({ effects }) => ({}),
)
