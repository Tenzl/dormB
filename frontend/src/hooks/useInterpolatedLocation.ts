import { useEffect, useRef, useState } from "react";

export type InterpolatedLocation = {
  longitude: number;
  latitude: number;
  heading: number;
  routeVersion: number;
  coordinateIndex?: number;
};

function approximateMeters(from: InterpolatedLocation, target: InterpolatedLocation) {
  return Math.hypot(
    (target.longitude - from.longitude) * 109300,
    (target.latitude - from.latitude) * 111000,
  );
}

export function isLocationDiscontinuity(from: InterpolatedLocation, target: InterpolatedLocation) {
  const movedBackward = from.coordinateIndex !== undefined
    && target.coordinateIndex !== undefined
    && target.coordinateIndex < from.coordinateIndex;
  return from.routeVersion !== target.routeVersion || movedBackward || approximateMeters(from, target) > 120;
}

export function useInterpolatedLocation(target: InterpolatedLocation) {
  const [location, setLocation] = useState(target);
  const latest = useRef(target);

  useEffect(() => {
    const from = latest.current;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion || isLocationDiscontinuity(from, target)) {
      latest.current = target;
      setLocation(target);
      return;
    }
    const startedAt = Date.now();
    const duration = 4500;
    const headingDelta = ((target.heading - from.heading + 540) % 360) - 180;
    let frame = 0;
    const tick = () => {
      const linear = Math.min(1, (Date.now() - startedAt) / duration);
      const eased = 1 - (1 - linear) ** 3;
      const next = {
        longitude: from.longitude + (target.longitude - from.longitude) * eased,
        latitude: from.latitude + (target.latitude - from.latitude) * eased,
        heading: from.heading + headingDelta * eased,
        routeVersion: target.routeVersion,
        coordinateIndex: target.coordinateIndex,
      };
      latest.current = next;
      setLocation(next);
      if (linear < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [target.coordinateIndex, target.heading, target.latitude, target.longitude, target.routeVersion]);

  return location;
}
