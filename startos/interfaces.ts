import { i18n } from './i18n'
import { sdk } from './sdk'
import { uiPort } from './utils'

export const setInterfaces = sdk.setupInterfaces(async ({ effects }) => {
  const multi = sdk.MultiHost.of(effects, 'ui')
  const origin = await multi.bindPort(uiPort, {
    protocol: 'http',
    preferredExternalPort: uiPort,
  })

  const ui = sdk.createInterface(effects, {
    name: i18n('Sabi9 Web Interface'),
    id: 'ui',
    description: i18n(
      'Wasabi-style wallet interface: balances, coinjoin, privacy-first sending',
    ),
    type: 'ui',
    masked: false,
    schemeOverride: null,
    username: null,
    path: '',
    query: {},
  })

  return [await origin.export([ui])]
})
