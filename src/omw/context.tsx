import React, { createContext, useContext, useState } from 'react';
import type { ResolvedPlaceLocation } from '@/lib/places';
import type { OmwRoute } from './routes';

export type OmwTrip = { from: ResolvedPlaceLocation; to: ResolvedPlaceLocation; via: ResolvedPlaceLocation | null; radiusKm: number; route: OmwRoute; routes: OmwRoute[] };
const OmwContext = createContext<{
  trip: OmwTrip | null;
  setTrip: (trip: OmwTrip | null) => void;
} | null>(null);

// Session state survives tab replacements and is reset when the account changes.
export function OmwProvider({ children }: { children: React.ReactNode }) {
  const [trip, setTrip] = useState<OmwTrip | null>(null);
  return <OmwContext.Provider value={{ trip, setTrip }}>{children}</OmwContext.Provider>;
}

export function useOmwTrip() {
  const context = useContext(OmwContext);
  if (!context) throw new Error('OMW provider missing');
  return context;
}
