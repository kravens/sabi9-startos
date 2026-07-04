import { sdk } from './sdk'

// Back up the whole data volume: wallet files, Config.json and the block-filter
// index all live under /data/.walletwasabi. Filters are re-downloadable but small
// enough that excluding them isn't worth a slower disaster recovery.
export const { createBackup, restoreBackup } = sdk.setupBackups(async () =>
  sdk.Backups.ofVolumes('main'),
)
