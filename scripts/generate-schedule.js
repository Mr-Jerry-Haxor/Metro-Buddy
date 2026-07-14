import fs from 'fs';
import path from 'path';

function readCsv(filePath) {
  const rows = fs.readFileSync(filePath, 'utf8').trim().split(/\r?\n/);
  const headers = parseCsvLine(rows.shift());
  return rows.map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce((record, header, index) => {
      record[header] = values[index] ?? '';
      return record;
    }, {});
  });
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      values.push(current);
      current = '';
    } else {
      current += character;
    }
  }

  values.push(current);
  return values;
}

function timeToMinutes(time) {
  const [hours, minutes, seconds] = String(time).split(':').map(Number);
  return hours * 60 + minutes + Math.round((seconds || 0) / 60);
}

const sourceDir = path.resolve('GTFS_DATA');
const outputFile = path.resolve('public/assets/metro_schedule.json');

const agency = readCsv(path.join(sourceDir, 'agency.txt'))[0];
const feedInfo = readCsv(path.join(sourceDir, 'feed_info.txt'))[0];
const routes = readCsv(path.join(sourceDir, 'routes.txt'));
const stops = readCsv(path.join(sourceDir, 'stops.txt'));
const trips = readCsv(path.join(sourceDir, 'trips.txt'));
const stopTimes = readCsv(path.join(sourceDir, 'stop_times.txt'));
const fares = readCsv(path.join(sourceDir, 'fare_attributes.txt'));
const fareRules = readCsv(path.join(sourceDir, 'fare_rules.txt'));

const parentByStop = new Map();
const platformByStop = new Map();
stops.forEach((stop) => {
  parentByStop.set(stop.stop_id, stop.parent_station || stop.stop_id);
  platformByStop.set(stop.stop_id, stop.platform_code || '');
});

const callsByTrip = new Map();
stopTimes.forEach((call) => {
  if (!callsByTrip.has(call.trip_id)) {
    callsByTrip.set(call.trip_id, []);
  }
  callsByTrip.get(call.trip_id).push(call);
});

const services = {};
trips.forEach((trip) => {
  const calls = (callsByTrip.get(trip.trip_id) || [])
    .sort((left, right) => Number(left.stop_sequence) - Number(right.stop_sequence))
    .map((call) => [
      parentByStop.get(call.stop_id) || call.stop_id,
      timeToMinutes(call.departure_time || call.arrival_time),
      platformByStop.get(call.stop_id) || ''
    ]);

  if (calls.length < 2) {
    return;
  }

  if (!services[trip.service_id]) {
    services[trip.service_id] = [];
  }
  services[trip.service_id].push([
    trip.route_id,
    Number(trip.direction_id),
    trip.trip_headsign,
    calls
  ]);
});

Object.values(services).forEach((serviceTrips) => {
  serviceTrips.sort((left, right) => left[3][0][1] - right[3][0][1]);
});

const fareById = new Map(fares.map((fare) => [fare.fare_id, Number(fare.price)]));
const fareMatrix = {};
fareRules.forEach((rule) => {
  const price = fareById.get(rule.fare_id);
  if (!rule.origin_id || !rule.destination_id || !Number.isFinite(price)) {
    return;
  }
  if (!fareMatrix[rule.origin_id]) {
    fareMatrix[rule.origin_id] = {};
  }
  fareMatrix[rule.origin_id][rule.destination_id] = price;
});

const payload = {
  meta: {
    source: agency.agency_name,
    sourceUrl: 'https://hmrl.co.in/open-data/',
    attribution: 'Contains data provided by Hyderabad Metro Rail Ltd.',
    feedPublisher: feedInfo.feed_publisher_name,
    feedStartDate: feedInfo.feed_start_date,
    feedEndDate: feedInfo.feed_end_date,
    timezone: agency.agency_timezone,
    generatedAt: new Date().toISOString(),
    realtimeVehicleFeed: false
  },
  routes: Object.fromEntries(
    routes.map((route) => [
      route.route_id,
      {
        shortName: route.route_short_name,
        longName: route.route_long_name,
        color: `#${route.route_color}`,
        textColor: `#${route.route_text_color}`
      }
    ])
  ),
  services,
  fares: fareMatrix
};

fs.writeFileSync(outputFile, `${JSON.stringify(payload)}\n`, 'utf8');
console.log(
  `Generated ${trips.length} scheduled trips and ${fareRules.length} fare rules in ${path.relative(process.cwd(), outputFile)}.`
);
