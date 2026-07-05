import { setupManifest } from '@start9labs/start-sdk'
import { short, long } from './i18n'

export const manifest = setupManifest({
  id: 'sabi9',
  title: 'Sabi9',
  license: 'MIT',
  packageRepo: 'https://github.com/kravens/sabi9-startos',
  upstreamRepo: 'https://github.com/WalletWasabi/WalletWasabi',
  marketingUrl: 'https://coinjoin.nl/',
  donationUrl: null,
  description: { short, long },
  volumes: ['main'],
  images: {
    main: {
      source: {
        dockerBuild: {},
      },
      arch: ['x86_64', 'aarch64'],
    },
  },
  dependencies: {},
})
