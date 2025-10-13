import { getAverageDuration } from '../db/indexedDB';
import { estimateDurationInMinutes } from './distance';

export async function getHistoricalEtaMinutes(from, to) {
  if (!from || !to) {
    return null;
  }
  const average = await getAverageDuration(from, to);
  return average ? Math.round(average) : null;
}

export function predictEtaFromDistance(distanceKm, fallbackMinutes) {
  const estimated = estimateDurationInMinutes(distanceKm);
  return fallbackMinutes ?? estimated;
}
