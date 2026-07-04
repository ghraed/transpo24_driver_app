export interface CountryOption {
  code: string;
  label: string;
  cities: string[];
}

export const COUNTRY_OPTIONS: CountryOption[] = [
  { code: 'AT', label: 'Austria', cities: ['Vienna', 'Graz', 'Linz', 'Salzburg', 'Innsbruck'] },
  { code: 'BH', label: 'Bahrain', cities: ['Manama', 'Riffa', 'Muharraq', 'Isa Town', 'Hamad Town'] },
  { code: 'BE', label: 'Belgium', cities: ['Brussels', 'Antwerp', 'Ghent', 'Charleroi', 'Liege'] },
  { code: 'CH', label: 'Switzerland', cities: ['Zurich', 'Geneva', 'Basel', 'Lausanne', 'Bern'] },
  { code: 'DE', label: 'Germany', cities: ['Berlin', 'Hamburg', 'Munich', 'Cologne', 'Frankfurt'] },
  { code: 'EG', label: 'Egypt', cities: ['Cairo', 'Alexandria', 'Giza', 'Mansoura', 'Sharm El Sheikh'] },
  { code: 'ES', label: 'Spain', cities: ['Madrid', 'Barcelona', 'Valencia', 'Seville', 'Malaga'] },
  { code: 'FR', label: 'France', cities: ['Paris', 'Lyon', 'Marseille', 'Toulouse', 'Nice'] },
  { code: 'GB', label: 'United Kingdom', cities: ['London', 'Manchester', 'Birmingham', 'Liverpool', 'Leeds'] },
  { code: 'IQ', label: 'Iraq', cities: ['Baghdad', 'Basra', 'Erbil', 'Najaf', 'Mosul'] },
  { code: 'IT', label: 'Italy', cities: ['Rome', 'Milan', 'Naples', 'Turin', 'Bologna'] },
  { code: 'JO', label: 'Jordan', cities: ['Amman', 'Zarqa', 'Irbid', 'Aqaba', 'Madaba'] },
  { code: 'KW', label: 'Kuwait', cities: ['Kuwait City', 'Hawalli', 'Farwaniya', 'Salmiya', 'Ahmadi'] },
  { code: 'LB', label: 'Lebanon', cities: ['Beirut', 'Tripoli', 'Sidon', 'Tyre', 'Jounieh'] },
  { code: 'NL', label: 'Netherlands', cities: ['Amsterdam', 'Rotterdam', 'The Hague', 'Utrecht', 'Eindhoven'] },
  { code: 'OM', label: 'Oman', cities: ['Muscat', 'Salalah', 'Sohar', 'Nizwa', 'Sur'] },
  { code: 'QA', label: 'Qatar', cities: ['Doha', 'Al Rayyan', 'Al Wakrah', 'Lusail', 'Umm Salal'] },
  { code: 'SA', label: 'Saudi Arabia', cities: ['Riyadh', 'Jeddah', 'Dammam', 'Mecca', 'Medina'] },
  { code: 'TR', label: 'Turkey', cities: ['Istanbul', 'Ankara', 'Izmir', 'Bursa', 'Antalya'] },
  { code: 'AE', label: 'United Arab Emirates', cities: ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Al Ain'] },
];
