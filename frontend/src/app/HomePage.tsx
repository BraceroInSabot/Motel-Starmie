import { Container, SegmentedControl, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';

import { FALLBACK_LANGUAGE, SUPPORTED_LANGUAGES, isSupportedLanguage } from '../i18n/languages';

/** Placeholder start page proving the stack works; replaced by real routes per story. */
export function HomePage() {
  const { t, i18n } = useTranslation('common');

  return (
    <Container size="sm" py="xl">
      <Stack gap="md">
        <Title order={1}>{t('app.name')}</Title>
        <Text>{t('app.skeletonReady')}</Text>
        <SegmentedControl
          aria-label={t('language.label')}
          value={i18n.resolvedLanguage ?? FALLBACK_LANGUAGE}
          onChange={(value) => {
            if (isSupportedLanguage(value)) {
              void i18n.changeLanguage(value);
            }
          }}
          data={SUPPORTED_LANGUAGES.map((language) => ({
            value: language,
            label: t(`language.${language}`),
          }))}
        />
      </Stack>
    </Container>
  );
}
