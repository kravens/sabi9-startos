import { sdk } from '../sdk'
import { setInterfaces } from '../interfaces'
import { setDependencies } from '../dependencies'
import { versionGraph } from '../versions'

// Nothing to do at install time beyond the defaults: the wasabi-start.sh
// entrypoint materialises Config.json inside the data volume on first boot.
export const { packageInit, packageUninit, containerInit } = sdk.setupInit(
  versionGraph,
  setInterfaces,
  setDependencies,
)
