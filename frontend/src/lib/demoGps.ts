export const DEMO_SHIPPER_GATE = {
  latitude: 10.883162,
  longitude: 106.781156,
  source: "DEMO_GATE" as const,
};

export function captureDemoShipperStartLocation() {
  return {
    ...DEMO_SHIPPER_GATE,
    recordedAt: new Date().toISOString(),
  };
}
