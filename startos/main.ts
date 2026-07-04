import { i18n } from './i18n'
import { sdk } from './sdk'
import { uiPort, rpcPort } from './utils'

export const main = sdk.setupMain(async ({ effects }) => {
  console.info(i18n('Starting Sabi9 (Wasabi daemon + web UI)'))

  const mkMounts = () =>
    sdk.Mounts.of().mountVolume({
      volumeId: 'main',
      subpath: null,
      mountpoint: '/data',
      readonly: false,
    })

  return sdk.Daemons.of(effects)
    .addDaemon('wasabi', {
      subcontainer: await sdk.SubContainer.of(
        effects,
        { imageId: 'main' },
        mkMounts(),
        'wasabi-sub',
      ),
      // wasabi-start.sh writes /data/.walletwasabi/client/Config.json (RPC enabled,
      // bound to 127.0.0.1 only) and then exec's wassabeed with HOME=/data.
      exec: { command: ['/usr/local/bin/wasabi-start.sh'] },
      ready: {
        display: i18n('Wasabi Daemon'),
        fn: () =>
          sdk.healthCheck.checkPortListening(effects, rpcPort, {
            successMessage: i18n('The Wasabi daemon RPC is ready'),
            errorMessage: i18n('The Wasabi daemon is still starting (Tor bootstrap)'),
          }),
      },
      requires: [],
    })
    .addDaemon('web', {
      subcontainer: await sdk.SubContainer.of(
        effects,
        { imageId: 'main' },
        mkMounts(),
        'web-sub',
      ),
      exec: { command: ['python3', '/opt/sabi9/sabi9d.py'] },
      ready: {
        display: i18n('Web Interface'),
        fn: () =>
          sdk.healthCheck.checkPortListening(effects, uiPort, {
            successMessage: i18n('The Sabi9 web interface is ready'),
            errorMessage: i18n('The web interface is not ready'),
          }),
      },
      requires: ['wasabi'],
    })
})
