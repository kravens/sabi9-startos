export const DEFAULT_LANG = 'en_US'

const dict = {
  // main.ts
  'Starting Sabi9 (Wasabi daemon + web UI)': 0,
  'Wasabi Daemon': 1,
  'The Wasabi daemon RPC is ready': 2,
  'The Wasabi daemon is still starting (Tor bootstrap)': 3,
  'Web Interface': 4,
  'The Sabi9 web interface is ready': 5,
  'The web interface is not ready': 6,

  // interfaces.ts
  'Sabi9 Web Interface': 7,
  'Wasabi-style wallet interface: balances, coinjoin, privacy-first sending': 8,
} as const

/**
 * Plumbing. DO NOT EDIT.
 */
export type I18nKey = keyof typeof dict
export type LangDict = Record<(typeof dict)[I18nKey], string>
export default dict
