// Keep these in sync with the countries offered by CountryPicker.
// Values are international calling codes from libphonenumber metadata.
const COUNTRY_CALLING_CODES: Record<string, string> = {
  AD: '+376', AL: '+355', AM: '+374', AT: '+43', AX: '+358', AZ: '+994',
  BA: '+387', BE: '+32', BG: '+359', BY: '+375', CH: '+41', CY: '+357',
  CZ: '+420', DE: '+49', DK: '+45', EE: '+372', ES: '+34', FI: '+358',
  FO: '+298', FR: '+33', GB: '+44', GE: '+995', GG: '+44', GI: '+350',
  GR: '+30', HR: '+385', HU: '+36', IE: '+353', IM: '+44', IS: '+354',
  IT: '+39', JE: '+44', LI: '+423', LT: '+370', LU: '+352', LV: '+371',
  MC: '+377', MD: '+373', ME: '+382', MK: '+389', MT: '+356', NL: '+31',
  NO: '+47', PL: '+48', PT: '+351', RO: '+40', RS: '+381', SE: '+46',
  SI: '+386', SJ: '+47', SK: '+421', SM: '+378', TR: '+90', UA: '+380',
  VA: '+39', XK: '+383', AE: '+971', LB: '+961', QA: '+974', SA: '+966',
  US: '+1', RU: '+7',
};

export function callingCodeForCountry(countryCode?: string | null): string {
  return COUNTRY_CALLING_CODES[countryCode?.trim().toUpperCase() ?? ''] ?? '';
}
