const IST_TIMEZONE = 'Asia/Kolkata';
const LINE_NAMES = {
  RED: 'Red Line',
  GREEN: 'Green Line',
  BLUE: 'Blue Line'
};

const clockFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST_TIMEZONE,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

function getClockParts(date = new Date()) {
  return clockFormatter.formatToParts(date).reduce((parts, part) => {
    if (part.type !== 'literal') {
      parts[part.type] = part.value;
    }
    return parts;
  }, {});
}

export function getServiceClock(date = new Date()) {
  const current = getClockParts(date);
  const rawMinutes = Number(current.hour) * 60 + Number(current.minute);
  const afterMidnight = rawMinutes < 180;
  const serviceDate = afterMidnight ? new Date(date.getTime() - 3 * 60 * 60 * 1000) : date;
  const serviceDay = getClockParts(serviceDate).weekday;
  const serviceId = serviceDay === 'Sun' ? 'SU' : serviceDay === 'Sat' ? 'SA' : 'WK';

  return {
    serviceId,
    minutes: afterMidnight ? rawMinutes + 1440 : rawMinutes,
    timeLabel: `${current.hour}:${current.minute}`,
    dayLabel: serviceDay
  };
}

export function formatServiceTime(totalMinutes) {
  if (!Number.isFinite(totalMinutes)) {
    return '—';
  }
  const minutesInDay = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(minutesInDay / 60);
  const minutes = minutesInDay % 60;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

export function buildScheduleIndex(schedule) {
  const byServiceStation = {};
  const tripsByService = {};

  Object.entries(schedule?.services || {}).forEach(([serviceId, compactTrips]) => {
    byServiceStation[serviceId] = {};
    tripsByService[serviceId] = compactTrips.map((compactTrip, tripIndex) => {
      const [routeId, directionId, headsign, calls] = compactTrip;
      const trip = {
        id: `${serviceId}-${tripIndex}`,
        routeId,
        directionId,
        headsign,
        calls: calls.map(([stationId, departureMinutes, platform]) => ({
          stationId,
          departureMinutes,
          platform
        }))
      };

      trip.calls.forEach((call, callIndex) => {
        if (!byServiceStation[serviceId][call.stationId]) {
          byServiceStation[serviceId][call.stationId] = [];
        }
        byServiceStation[serviceId][call.stationId].push({
          trip,
          callIndex,
          departureMinutes: call.departureMinutes,
          platform: call.platform
        });
      });
      return trip;
    });

    Object.values(byServiceStation[serviceId]).forEach((departures) => {
      departures.sort((left, right) => left.departureMinutes - right.departureMinutes);
    });
  });

  return { byServiceStation, tripsByService };
}

export function getUpcomingDepartures(index, stationId, date = new Date(), limit = 8) {
  const clock = getServiceClock(date);
  const stationDepartures = index?.byServiceStation?.[clock.serviceId]?.[stationId] || [];

  return stationDepartures
    .filter((departure) => departure.departureMinutes >= clock.minutes)
    .slice(0, limit)
    .map((departure) => ({
      ...departure,
      routeId: departure.trip.routeId,
      lineName: LINE_NAMES[departure.trip.routeId] || departure.trip.routeId,
      headsign: departure.trip.headsign,
      minutesAway: Math.max(0, departure.departureMinutes - clock.minutes),
      timeLabel: formatServiceTime(departure.departureMinutes)
    }));
}

export function getStationServiceSpan(index, stationId, date = new Date()) {
  const clock = getServiceClock(date);
  const departures = index?.byServiceStation?.[clock.serviceId]?.[stationId] || [];
  const spans = new Map();

  departures.forEach((departure) => {
    const key = `${departure.trip.routeId}|${departure.trip.headsign}`;
    const current = spans.get(key) || {
      routeId: departure.trip.routeId,
      lineName: LINE_NAMES[departure.trip.routeId] || departure.trip.routeId,
      headsign: departure.trip.headsign,
      first: departure.departureMinutes,
      last: departure.departureMinutes,
      platform: departure.platform
    };
    current.first = Math.min(current.first, departure.departureMinutes);
    current.last = Math.max(current.last, departure.departureMinutes);
    if (!current.platform && departure.platform) {
      current.platform = departure.platform;
    }
    spans.set(key, current);
  });

  return Array.from(spans.values()).sort((left, right) => left.first - right.first);
}

export function getEstimatedTrainPositions(index, date = new Date()) {
  const clock = getServiceClock(date);
  const trips = index?.tripsByService?.[clock.serviceId] || [];
  const active = [];

  trips.forEach((trip) => {
    const firstCall = trip.calls[0];
    const lastCall = trip.calls[trip.calls.length - 1];
    if (
      !firstCall ||
      !lastCall ||
      clock.minutes < firstCall.departureMinutes ||
      clock.minutes > lastCall.departureMinutes
    ) {
      return;
    }

    for (let callIndex = 0; callIndex < trip.calls.length - 1; callIndex += 1) {
      const from = trip.calls[callIndex];
      const to = trip.calls[callIndex + 1];
      if (clock.minutes < from.departureMinutes || clock.minutes > to.departureMinutes) {
        continue;
      }
      const segmentDuration = Math.max(to.departureMinutes - from.departureMinutes, 1);
      active.push({
        id: trip.id,
        routeId: trip.routeId,
        lineName: LINE_NAMES[trip.routeId] || trip.routeId,
        headsign: trip.headsign,
        fromStationId: from.stationId,
        toStationId: to.stationId,
        progress: Math.min(Math.max((clock.minutes - from.departureMinutes) / segmentDuration, 0), 1),
        dueMinutes: Math.max(0, to.departureMinutes - clock.minutes),
        nextTimeLabel: formatServiceTime(to.departureMinutes)
      });
      break;
    }
  });

  return active;
}

export function getServiceState(date = new Date()) {
  const clock = getServiceClock(date);
  if (clock.minutes < 360) {
    return { state: 'before-service', label: 'Service starts at 6:00 AM', clock };
  }
  if (clock.minutes > 1440) {
    return { state: 'after-service', label: 'Service has ended for today', clock };
  }
  const peak =
    (clock.minutes >= 480 && clock.minutes <= 660) ||
    (clock.minutes >= 1020 && clock.minutes <= 1200);
  return {
    state: peak ? 'peak' : 'running',
    label: peak ? 'Peak-hour service' : 'Metro service hours',
    clock
  };
}

export function getLineName(routeId) {
  return LINE_NAMES[routeId] || routeId;
}
