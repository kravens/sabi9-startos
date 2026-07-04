import { StartSdk } from '@start9labs/start-sdk'
import { manifest } from './manifest'

export const sdk = StartSdk.of()
  .withManifest(manifest)
  .withStore<Record<string, never>>()
  .build(true)
