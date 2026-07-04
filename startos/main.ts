import { i18n } from './i18n'
import { sdk } from './sdk'
import { uiPort, rpcPort } from './utils'

export const main = sdk.setupMain(async ({ effects }) => {
  console.info(i18n('Starting Sabi9 (Wasabi daemon + web UI)'))

  // restart bridge: the web UI (Settings save / wallet import) can request a FULL
  // service restart - identical to Dashboard → Restart. Subcontainers can't call
  // StartOS, so sabi9d raises a read-once flag on /restart-pending and this
  // runtime watcher (same loopback as the subcontainers) calls effects.restart().
  const restartWatcher = setInterval(async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${uiPort}/restart-pending`)
      const j = (await res.json()) as { restart?: boolean }
      if (j.restart) {
        clearInterval(restartWatcher)
        console.info(i18n('Web UI requested a full service restart'))
        await effects.restart()
      }
    } catch (e) {} // web daemon not up (yet): nothing to do
  }, 4000)

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
