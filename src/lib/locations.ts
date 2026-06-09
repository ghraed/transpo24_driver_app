export interface CountryOption {
  code: string;
  name: string;
  cities: string[];
}

export const COUNTRY_OPTIONS: CountryOption[] = [
  {
    code: 'AE',
    name: 'United Arab Emirates',
    cities: ['Abu Dhabi', 'Ajman', 'Al Ain', 'Dubai', 'Fujairah', 'Ras Al Khaimah', 'Sharjah', 'Umm Al Quwain'],
  },
  {
    code: 'BH',
    name: 'Bahrain',
    cities: ['Al Hidd', 'Budaiya', 'Hamad Town', 'Isa Town', 'Manama', 'Muharraq', 'Riffa', 'Sitra'],
  },
  {
    code: 'CH',
    name: 'Switzerland',
    cities: ['Basel', 'Bern', 'Fribourg', 'Geneva', 'Lausanne', 'Lucerne', 'Lugano', 'St. Gallen', 'Winterthur', 'Zurich'],
  },
  {
    code: 'EG',
    name: 'Egypt',
    cities: ['Alexandria', 'Aswan', 'Cairo', 'Giza', 'Hurghada', 'Luxor', 'Mansoura', 'Sharm El Sheikh', 'Suez', 'Tanta'],
  },
  {
    code: 'JO',
    name: 'Jordan',
    cities: ['Amman', 'Aqaba', 'Irbid', 'Jerash', 'Madaba', 'Mafraq', 'Salt', 'Zarqa'],
  },
  {
    code: 'KW',
    name: 'Kuwait',
    cities: ['Ahmadi', 'Farwaniya', 'Hawalli', 'Jahra', 'Kuwait City', 'Mubarak Al-Kabeer', 'Sabah Al Salem', 'Salmiya'],
  },
  {
    code: 'LB',
    name: 'Lebanon',
    cities: ['Aley', 'Batroun', 'Beirut', 'Byblos', 'Jounieh', 'Nabatieh', 'Saida', 'Tripoli', 'Tyre', 'Zahle'],
  },
  {
    code: 'OM',
    name: 'Oman',
    cities: ['Bahla', 'Barka', 'Muscat', 'Nizwa', 'Salalah', 'Seeb', 'Sohar', 'Sur'],
  },
  {
    code: 'QA',
    name: 'Qatar',
    cities: ['Al Khor', 'Al Rayyan', 'Al Wakrah', 'Doha', 'Dukhan', 'Lusail', 'Madinat ash Shamal', 'Umm Salal'],
  },
  {
    code: 'SA',
    name: 'Saudi Arabia',
    cities: ['Abha', 'Dammam', 'Jeddah', 'Khobar', 'Mecca', 'Medina', 'Riyadh', 'Tabuk', 'Taif', 'Yanbu'],
  },
];

export function getFlagEmoji(countryCode: string): string {
  return countryCode
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}
