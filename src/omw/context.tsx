import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { calculateDistanceMeters } from '@/utils/locationValidation';
import { readOmwTrip, writeOmwTrip } from './storage';
import type { ResolvedPlaceLocation } from '@/lib/places';
import type { OmwRoute } from './routes';

export type OmwTrip = { from: ResolvedPlaceLocation; to: ResolvedPlaceLocation; via: ResolvedPlaceLocation | null; radiusKm: number; route: OmwRoute; routes: OmwRoute[] };
const OmwContext = createContext<{
  trip: OmwTrip | null;
  setTrip: (trip: OmwTrip | null) => void;
  saveError: boolean;
  retrySave: () => void;
} | null>(null);

// The layout keys this provider by driver, keeping saved trips isolated by account.
export function OmwProvider({ children, driverId }: { children: React.ReactNode; driverId?: string }) {
  const [trip, updateTrip] = useState<OmwTrip | null>(null);
  const [ready, setReady] = useState(!driverId);
  const [saveError, setSaveError] = useState(false);
  const currentTrip = useRef<OmwTrip | null>(null);
  const readFailed = useRef(false);
  const version = useRef(0);
  const writes = useRef(Promise.resolve());
  const persist = useCallback((next: OmwTrip | null) => {
    if (!driverId) return;
    writes.current = writes.current.catch(() => undefined).then(() => writeOmwTrip(driverId, next));
    void writes.current.then(() => setSaveError(false), () => setSaveError(true));
  }, [driverId]);
  const setTrip = useCallback((next: OmwTrip | null) => {
    ++version.current;
    readFailed.current = false;
    currentTrip.current = next;
    updateTrip(next);
    persist(next);
  }, [persist]);
  useEffect(() => {
    if (!driverId) return;
    let active = true;
    const initialVersion = version.current;
    void readOmwTrip(driverId).then(saved => {
      if (active && version.current === initialVersion) { currentTrip.current = saved; updateTrip(saved); }
      if (active) setReady(true);
    }).catch(() => { if (active) { readFailed.current = true; setSaveError(true); setReady(true); } });
    return () => { active = false; };
  }, [driverId]);

  const retrySave = () => {
    if (!readFailed.current || !driverId) { persist(currentTrip.current); return; }
    const initialVersion = version.current;
    void readOmwTrip(driverId).then(saved => {
      if (version.current !== initialVersion) return;
      currentTrip.current = saved; updateTrip(saved);
      readFailed.current = false; setSaveError(false);
    }).catch(() => setSaveError(true));
  };

  useEffect(() => {
    if (!trip) return;
    let disposed = false;
    let generation = 0;
    let subscription: Location.LocationSubscription | undefined;
    const check = (location: Location.LocationObject) => {
      const age = Date.now() - location.timestamp;
      const accuracy = location.coords.accuracy;
      if (!disposed && currentTrip.current === trip && AppState.currentState === 'active' && age >= 0 && age <= 30000
        && accuracy != null && accuracy >= 0 && accuracy <= 50
        && calculateDistanceMeters(location.coords, trip.to) <= 100) setTrip(null);
    };
    const start = async () => {
      const current = ++generation;
      subscription?.remove(); subscription = undefined;
      if (AppState.currentState !== 'active') return;
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (disposed || current !== generation || !permission.granted) return;
        const watch = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High,
          distanceInterval: 20, timeInterval: 5000 }, check);
        if (disposed || current !== generation) { watch.remove(); return; }
        subscription = watch;
        const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        if (current === generation) check(location);
      } catch { /* Keep the trip saved when GPS is unavailable. */ }
    };
    void start();
    const listener = AppState.addEventListener('change', () => { void start(); });
    return () => { disposed = true; ++generation; subscription?.remove(); listener.remove(); };
  }, [trip, setTrip]);

  return <OmwContext.Provider value={{ trip, setTrip, saveError, retrySave }}>{ready ? children : null}</OmwContext.Provider>;
}

export function useOmwTrip() {
  const context = useContext(OmwContext);
  if (!context) throw new Error('OMW provider missing');
  return context;
}
