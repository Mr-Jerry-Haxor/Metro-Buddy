const EARTH_RADIUS_KM = 6371;

function toRadians(value) {
  return (value * Math.PI) / 180;
}

export function haversineDistance(coordA, coordB) {
  if (!coordA || !coordB) {
    return Infinity;
  }
  const latDiff = toRadians(coordB.lat - coordA.lat);
  const lonDiff = toRadians(coordB.lon - coordA.lon);

  const a =
    Math.sin(latDiff / 2) ** 2 +
    Math.cos(toRadians(coordA.lat)) *
      Math.cos(toRadians(coordB.lat)) *
      Math.sin(lonDiff / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

export function findNearestStation(position, stations) {
  if (!position || !stations?.length) {
    return null;
  }

  const current = {
    lat: position.coords.latitude,
    lon: position.coords.longitude
  };

  return stations.reduce(
    (nearest, station) => {
      const distanceKm = haversineDistance(current, {
        lat: station.stop_lat,
        lon: station.stop_lon
      });

      if (distanceKm < nearest.distanceKm) {
        return { station, distanceKm };
      }

      return nearest;
    },
    { station: null, distanceKm: Infinity }
  );
}

export function estimateDurationInMinutes(distanceKm, averageSpeedKmh = 32) {
  if (!distanceKm) {
    return 0;
  }
  return Math.round((distanceKm / averageSpeedKmh) * 60);
}
