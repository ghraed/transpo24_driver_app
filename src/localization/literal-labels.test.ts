import { expect, test } from '@jest/globals';
import i18n, { initializeI18n } from './i18n';
import en from './locales/en.json';
import ar from './locales/ar.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import es from './locales/es.json';
import it from './locales/it.json';

test('literal labels containing colons translate and interpolate in every supported language', async () => {
  await initializeI18n();
  for (const [language, resources] of Object.entries({ en, ar, fr, de, es, it })) {
    await i18n.changeLanguage(language);
    for (const key of ['Pinned: {{address}}', 'Request ID: {{value}}'] as const) {
      expect(i18n.t(key, { address: 'SYNTHETIC', value: 'T24-TEST' })).toBe(
        resources[key].replace('{{address}}', 'SYNTHETIC').replace('{{value}}', 'T24-TEST'),
      );
    }
  }
});
