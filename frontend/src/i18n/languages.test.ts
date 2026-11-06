import { describe, expect, it } from 'vitest';

import { detectGuestLanguage, isSupportedLanguage } from './languages';

describe('detectGuestLanguage (Technical Specs 4.3)', () => {
  it('uses ?lang= from the URL first', () => {
    expect(detectGuestLanguage('?lang=fr', 'en-US')).toBe('fr');
    expect(detectGuestLanguage('?lang=EN', 'fr-CA')).toBe('en');
  });

  it('ignores an unsupported ?lang= and falls back to the browser language', () => {
    expect(detectGuestLanguage('?lang=es', 'fr-CA')).toBe('fr');
  });

  it('maps any fr* browser language to fr and anything else to en', () => {
    expect(detectGuestLanguage('', 'fr')).toBe('fr');
    expect(detectGuestLanguage('', 'fr-FR')).toBe('fr');
    expect(detectGuestLanguage('', 'pt-BR')).toBe('en');
    expect(detectGuestLanguage('', undefined)).toBe('en');
  });
});

describe('isSupportedLanguage', () => {
  it('accepts only en and fr', () => {
    expect(isSupportedLanguage('en')).toBe(true);
    expect(isSupportedLanguage('fr')).toBe(true);
    expect(isSupportedLanguage('es')).toBe(false);
    expect(isSupportedLanguage(null)).toBe(false);
    expect(isSupportedLanguage(undefined)).toBe(false);
  });
});
