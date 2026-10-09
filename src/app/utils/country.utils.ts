import * as countries from 'i18n-iso-countries';

// Support english by default
countries.registerLocale(require('i18n-iso-countries/langs/en.json'));

export const getIsoAlpha2CountryCode = (countryName: string): string => {
  if (!countryName) return 'US';
  
  // Clean up input
  const cleanName = countryName.trim();
  
  // If it's already a 2-letter code, return it upper-cased
  if (cleanName.length === 2) {
    const isCode = countries.isValid(cleanName);
    if (isCode) return cleanName.toUpperCase();
  }

  // Get alpha 2 code from name
  const alpha2 = countries.getAlpha2Code(cleanName, 'en');
  
  return alpha2 || 'US';
};
