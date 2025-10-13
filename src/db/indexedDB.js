import Dexie from 'dexie';

export const db = new Dexie('hyderabad_metro_db');

db.version(1).stores({
  trips: '++id,from,to,startTime,endTime,duration',
  preferences: '&key',
  stations: '&stop_id,stop_name'
});

export async function addTrip(trip) {
  return db.trips.add(trip);
}

export async function getTrips() {
  return db.trips.orderBy('startTime').reverse().toArray();
}

export async function savePreference(key, value) {
  return db.preferences.put({ key, value });
}

export async function getPreference(key, defaultValue) {
  const record = await db.preferences.get(key);
  return record?.value ?? defaultValue;
}

export async function bulkUpsertStations(stations) {
  if (!stations?.length) {
    return;
  }
  await db.stations.bulkPut(stations);
}

export async function getStations() {
  return db.stations.orderBy('stop_name').toArray();
}

export async function getStationById(stopId) {
  return db.stations.get(stopId);
}

export async function getAverageDuration(from, to) {
  const trips = await db.trips.where({ from, to }).toArray();
  if (!trips.length) {
    return null;
  }
  const total = trips.reduce((sum, trip) => sum + trip.duration, 0);
  return total / trips.length;
}
