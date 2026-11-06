import { describe, expect, it } from 'vitest';

import { NAMESPACES } from './index';

// Technical Specs 4.5: `en` and `fr` must have exactly the same keys.
const files = import.meta.glob<Record<string, unknown>>('./locales/*/*.json', {
  eager: true,
  import: 'default',
});

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [prefix];
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) {
    return prefix ? [`${prefix}.{}`] : [];
  }
  return entries.flatMap(([key, child]) => flattenKeys(child, prefix ? `${prefix}.${key}` : key));
}

describe('translation files', () => {
  it.each(NAMESPACES)('namespace "%s" exists in en and fr with the same keys', (namespace) => {
    const en = files[`./locales/en/${namespace}.json`];
    const fr = files[`./locales/fr/${namespace}.json`];
    expect(en).toBeDefined();
    expect(fr).toBeDefined();
    expect(flattenKeys(fr).sort()).toEqual(flattenKeys(en).sort());
  });

  it('has no namespace file that is not declared', () => {
    const declared = new Set(
      NAMESPACES.flatMap((ns) => [`./locales/en/${ns}.json`, `./locales/fr/${ns}.json`]),
    );
    expect(Object.keys(files).filter((path) => !declared.has(path))).toEqual([]);
  });
});
