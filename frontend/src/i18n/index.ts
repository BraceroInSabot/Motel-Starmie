import i18n, { type BackendModule, type ReadCallback, type ResourceKey } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { FALLBACK_LANGUAGE, SUPPORTED_LANGUAGES, type Language } from './languages';

export const NAMESPACES = [
  'common',
  'booking',
  'frontDesk',
  'housekeeping',
  'guests',
  'reports',
  'settings',
] as const;
export type Namespace = (typeof NAMESPACES)[number];

/** Lazy-loads `locales/<lang>/<ns>.json` with Vite dynamic imports (one chunk per namespace). */
const lazyJsonBackend: BackendModule = {
  type: 'backend',
  init: () => undefined,
  read(language: string, namespace: string, callback: ReadCallback) {
    import(`./locales/${language}/${namespace}.json`)
      .then((module: { default: ResourceKey }) => {
        callback(null, module.default);
      })
      .catch((error: unknown) => {
        callback(error instanceof Error ? error : new Error(String(error)), null);
      });
  },
};

export async function initI18n(language: Language = FALLBACK_LANGUAGE): Promise<typeof i18n> {
  if (!i18n.isInitialized) {
    await i18n
      .use(lazyJsonBackend)
      .use(initReactI18next)
      .init({
        lng: language,
        fallbackLng: FALLBACK_LANGUAGE,
        supportedLngs: [...SUPPORTED_LANGUAGES],
        ns: ['common'],
        defaultNS: 'common',
        interpolation: { escapeValue: false }, // React already escapes output
        react: { useSuspense: true },
      });
  }
  return i18n;
}

export { i18n };
