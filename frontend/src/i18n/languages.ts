/** Supported languages (business rule: English and French only). Technical Specs 4.1, 4.3. */
export const SUPPORTED_LANGUAGES = ['en', 'fr'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const FALLBACK_LANGUAGE: Language = 'en';

/** `Intl` locales used for money and date formatting. */
export const INTL_LOCALE: Record<Language, string> = {
  en: 'en-CA',
  fr: 'fr-CA',
};

export function isSupportedLanguage(value: string | null | undefined): value is Language {
  return (
    value !== null &&
    value !== undefined &&
    (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
  );
}

/**
 * Guest booking widget rule (Technical Specs 4.3): `?lang=` in the URL first,
 * then the browser language (`fr*` → `fr`, anything else → `en`).
 */
export function detectGuestLanguage(search: string, browserLanguage: string | undefined): Language {
  const fromUrl = new URLSearchParams(search).get('lang')?.toLowerCase();
  if (isSupportedLanguage(fromUrl)) {
    return fromUrl;
  }
  return browserLanguage?.toLowerCase().startsWith('fr') ? 'fr' : FALLBACK_LANGUAGE;
}
