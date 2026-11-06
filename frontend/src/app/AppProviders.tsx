import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import 'dayjs/locale/fr';
import { Suspense, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { FALLBACK_LANGUAGE, isSupportedLanguage } from '../i18n/languages';

/** Mantine default theme: the business has no palette or logo. */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }),
  );

  return (
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={null}>
          <LocalizedDates>
            <Notifications />
            {children}
          </LocalizedDates>
        </Suspense>
      </QueryClientProvider>
    </MantineProvider>
  );
}

function LocalizedDates({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  return (
    <DatesProvider
      settings={{
        locale: isSupportedLanguage(i18n.resolvedLanguage)
          ? i18n.resolvedLanguage
          : FALLBACK_LANGUAGE,
      }}
    >
      {children}
    </DatesProvider>
  );
}
