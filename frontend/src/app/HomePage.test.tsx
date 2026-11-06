import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it } from 'vitest';

import { initI18n } from '../i18n';
import { AppProviders } from './AppProviders';
import { HomePage } from './HomePage';

beforeAll(async () => {
  await initI18n('en');
});

describe('HomePage', () => {
  it('renders the skeleton page and switches between English and French', async () => {
    render(
      <AppProviders>
        <HomePage />
      </AppProviders>,
    );

    expect(await screen.findByText('The application skeleton is running.')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Français'));
    expect(
      await screen.findByText("Le squelette de l'application fonctionne."),
    ).toBeInTheDocument();
  });
});
