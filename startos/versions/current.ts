import { VersionInfo, IMPOSSIBLE } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '2.8.0:0',
  releaseNotes: {
    en_US:
      'Initial release for StartOS: Wasabi Wallet daemon 2.8.0 with the Sabi9 web interface ' +
      '(coinjoin, privacy-first sending with change avoidance, receive with QR, discreet mode).',
  },
  migrations: {
    up: async ({ effects }) => {},
    down: IMPOSSIBLE,
  },
})
