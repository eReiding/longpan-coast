export const LOCATION = { lat: 21.927806, lon: 120.849472, day: 298, meridian: 120 };

export function solarPosition(hour, options = {}) {
  const { lat, lon, day, meridian } = { ...LOCATION, ...options };
  const latitude = lat * Math.PI / 180;
  const gamma = 2 * Math.PI * (day - 1 + (hour - 12) / 24) / 365;
  const equation = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const declination = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const solarTime = hour + (lon - meridian) * 4 / 60 + equation / 60;
  const angle = (solarTime - 12) * Math.PI / 12;
  const east = -Math.cos(declination) * Math.sin(angle);
  const up = Math.sin(latitude) * Math.sin(declination) + Math.cos(latitude) * Math.cos(declination) * Math.cos(angle);
  const north = Math.cos(latitude) * Math.sin(declination) - Math.sin(latitude) * Math.cos(declination) * Math.cos(angle);
  return {
    east, up, north,
    altitude: Math.asin(up),
    azimuth: Math.atan2(east, north),
    declination, equation, solarTime,
  };
}

export function solarEvents(options = {}) {
  const events = {};
  let previous = solarPosition(0, options).up;
  for (let hour = 0.05; hour <= 24; hour += 0.05) {
    const up = solarPosition(hour, options).up;
    if (previous <= 0 && up > 0 && !events.sunrise) events.sunrise = hour - 0.05 * up / (up - previous);
    if (previous > 0 && up <= 0 && !events.sunset) events.sunset = hour - 0.05 * previous / (previous - up);
    previous = up;
  }
  return events;
}
