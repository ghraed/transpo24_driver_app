import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type MapView from 'react-native-maps';
import type { Camera } from 'react-native-maps';

export type NavigationLocation = {
  latitude: number;
  longitude: number;
  heading?: number | null;
};

export function useNavigationCamera(
  mapRef: RefObject<MapView | null>,
  location: NavigationLocation | null,
) {
  const [isNavigationView, setIsNavigationView] = useState(false);
  const navigationEnabled = useRef(false);
  const overviewCamera = useRef<Camera | null>(null);
  const heading = useRef(0);
  const toggleVersion = useRef(0);
  const isNavigationEnabled = useCallback(() => navigationEnabled.current, []);

  const followDriver = useCallback((duration = 350) => {
    if (!navigationEnabled.current || !location) return;
    mapRef.current?.animateCamera({
      center: { latitude: location.latitude, longitude: location.longitude },
      heading: heading.current,
      pitch: 60,
      zoom: 18,
      altitude: 350,
    }, { duration });
  }, [location, mapRef]);

  useEffect(() => {
    const nextHeading = location?.heading;
    // GPS reports -1 when the direction is unknown. Keep the last usable heading.
    if (typeof nextHeading === 'number' && Number.isFinite(nextHeading) && nextHeading >= 0) {
      heading.current = nextHeading % 360;
    }
    followDriver();
  }, [followDriver, isNavigationView, location?.heading]);

  const toggleNavigationView = useCallback(() => {
    if (!location || !mapRef.current) return;
    const version = ++toggleVersion.current;
    const next = !navigationEnabled.current;
    if (next) {
      overviewCamera.current = null;
      void mapRef.current.getCamera?.().then((camera) => {
        if (version === toggleVersion.current) overviewCamera.current = camera;
      }).catch(() => undefined);
    } else {
      mapRef.current.animateCamera(overviewCamera.current ?? {
        center: { latitude: location.latitude, longitude: location.longitude },
        pitch: 0, heading: 0, zoom: 14, altitude: 4000,
      }, { duration: 350 });
    }
    navigationEnabled.current = next;
    setIsNavigationView(next);
  }, [location, mapRef]);

  return { isNavigationView, isNavigationEnabled, toggleNavigationView, followDriver };
}
