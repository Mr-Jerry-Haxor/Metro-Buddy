import fs from 'fs';
import path from 'path';

function readCsv(filePath) {
  const csvRaw = fs.readFileSync(filePath, 'utf8').trim().split(/\r?\n/);
  const header = csvRaw.shift().split(',');
  return csvRaw.map((line) => {
    const cols = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (char === ',' && !inQuotes) {
        cols.push(current);
        current = '';
        continue;
      }
      current += char;
    }
    cols.push(current);
    return header.reduce((acc, key, idx) => {
      acc[key] = cols[idx];
      return acc;
    }, {});
  });
}

const baseDir = path.resolve('d:/GITHUB/Metro-Buddy/GTFS_DATA');
const outputFile = path.resolve('d:/GITHUB/Metro-Buddy/public/assets/metro_lines.json');

const stops = readCsv(path.join(baseDir, 'stops.txt'));
const trips = readCsv(path.join(baseDir, 'trips.txt'));
const stopTimes = readCsv(path.join(baseDir, 'stop_times.txt'));

const parentLookup = new Map();
const childToParent = new Map();

stops.forEach((stop) => {
  if (stop.location_type === '1') {
    parentLookup.set(stop.stop_id, stop);
  }
  if (stop.parent_station) {
    childToParent.set(stop.stop_id, stop.parent_station);
  } else {
    childToParent.set(stop.stop_id, stop.stop_id);
  }
});

const stopTimesByTrip = stopTimes.reduce((acc, record) => {
  if (!acc[record.trip_id]) {
    acc[record.trip_id] = [];
  }
  acc[record.trip_id].push(record);
  return acc;
}, {});

const tripsByRouteDirection = new Map();
trips.forEach((trip) => {
  const key = `${trip.route_id}|${trip.direction_id}`;
  const candidateStops = stopTimesByTrip[trip.trip_id]?.length || 0;
  const current = tripsByRouteDirection.get(key);
  if (!current || candidateStops > current.stopCount) {
    tripsByRouteDirection.set(key, { tripId: trip.trip_id, stopCount: candidateStops });
  }
});

const lines = [];

for (const [key, entry] of tripsByRouteDirection.entries()) {
  const tripId = entry.tripId;
  const [routeId, directionId] = key.split('|');
  const sequence = stopTimesByTrip[tripId];
  if (!sequence) {
    continue;
  }
  sequence.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
  const stations = [];
  const seen = new Set();
  sequence.forEach((record) => {
    const parentId = childToParent.get(record.stop_id) || record.stop_id;
    if (seen.has(parentId)) {
      return;
    }
    seen.add(parentId);
    const parentStation = parentLookup.get(parentId) || stops.find((stop) => stop.stop_id === parentId);
    stations.push({
      stop_id: parentId,
      stop_name: parentStation?.stop_name || parentId
    });
  });
  if (stations.length > 1) {
    lines.push({ route_id: routeId, direction_id: directionId, trip_id: tripId, stations });
  }
}

fs.writeFileSync(outputFile, `${JSON.stringify(lines, null, 2)}\n`, 'utf8');

console.log(`Generated ${lines.length} metro line sequences.`);
