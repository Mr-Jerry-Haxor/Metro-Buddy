import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildScheduleIndex,
  getEstimatedTrainPositions,
  getServiceClock,
  getStationServiceSpan,
  getUpcomingDepartures
} from '../src/utils/schedule.js';

const schedule = JSON.parse(fs.readFileSync('public/assets/metro_schedule.json', 'utf8'));
const index = buildScheduleIndex(schedule);
const saturdaySixIst = new Date('2026-07-18T00:30:00.000Z');
const weekdayPeakIst = new Date('2026-07-20T02:30:00.000Z');

assert.equal(schedule.meta.realtimeVehicleFeed, false);
assert.equal(schedule.routes.RED.color.toLowerCase(), '#e31e24');
assert.equal(schedule.routes.GREEN.color.toLowerCase(), '#009846');
assert.equal(schedule.routes.BLUE.color.toLowerCase(), '#007abb');
assert.equal(getServiceClock(saturdaySixIst).serviceId, 'SA');

const mgbsDepartures = getUpcomingDepartures(index, 'MGB', saturdaySixIst, 4);
assert.equal(mgbsDepartures[0].departureMinutes, 360);
assert.equal(mgbsDepartures[0].routeId, 'GREEN');
assert.equal(mgbsDepartures[0].platform, '3');

const peakTrains = getEstimatedTrainPositions(index, weekdayPeakIst);
assert.ok(peakTrains.some((train) => train.routeId === 'RED'));
assert.ok(peakTrains.some((train) => train.routeId === 'GREEN'));
assert.ok(peakTrains.some((train) => train.routeId === 'BLUE'));
assert.ok(getStationServiceSpan(index, 'AME', weekdayPeakIst).length >= 4);
assert.equal(schedule.fares.MYP.LBN, 75);

console.log(
  `Verified ${Object.values(schedule.services).flat().length} trips, ${peakTrains.length} peak train estimates, official line colors, platforms, and fares.`
);
