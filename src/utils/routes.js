import { haversineDistance } from './distance';

const ROUTE_LABELS = {
  BLUE: 'Blue Line',
  RED: 'Red Line',
  GREEN: 'Green Line'
};

export function buildRouteIndex(lines = []) {
  const adjacency = new Map();
  const edgeRoutes = new Map();

  lines.forEach((line) => {
    const routeId = line?.route_id;
    const stations = line?.stations || [];

    for (let index = 0; index < stations.length - 1; index += 1) {
      const currentId = stations[index]?.stop_id;
      const nextId = stations[index + 1]?.stop_id;

      if (!currentId || !nextId) {
        continue;
      }

      if (!adjacency.has(currentId)) {
        adjacency.set(currentId, new Set());
      }
      if (!adjacency.has(nextId)) {
        adjacency.set(nextId, new Set());
      }
      adjacency.get(currentId).add(nextId);
      adjacency.get(nextId).add(currentId);

      const forwardKey = `${currentId}|${nextId}`;
      const backwardKey = `${nextId}|${currentId}`;

      if (!edgeRoutes.has(forwardKey)) {
        edgeRoutes.set(forwardKey, new Set());
      }
      if (!edgeRoutes.has(backwardKey)) {
        edgeRoutes.set(backwardKey, new Set());
      }
      edgeRoutes.get(forwardKey).add(routeId);
      edgeRoutes.get(backwardKey).add(routeId);
    }
  });

  return {
    adjacency,
    edgeRoutes
  };
}

function clonePath(path, extraNode) {
  const next = path.slice();
  next.push(extraNode);
  return next;
}

export function findKShortestPaths(adjacency, start, destination, maxPaths = 3) {
  if (!start || !destination) {
    return [];
  }

  if (!adjacency?.has?.(start) || !adjacency?.has?.(destination)) {
    return [];
  }

  const results = [];
  const queue = [[start]];
  const seenPaths = new Set();

  while (queue.length && results.length < maxPaths) {
    const path = queue.shift();
    const current = path[path.length - 1];

    if (current === destination) {
      results.push(path);
      continue;
    }

    const neighbours = adjacency.get(current) || [];
    neighbours.forEach((next) => {
      if (path.includes(next)) {
        return;
      }
      const candidate = clonePath(path, next);
      const key = candidate.join('>');
      if (seenPaths.has(key)) {
        return;
      }
      seenPaths.add(key);
      queue.push(candidate);
    });
  }

  return results;
}

function toStationLookup(stations = []) {
  return new Map(stations.map((station) => [station.stop_id, station]));
}

export function describePath(path = [], edgeRoutes = new Map(), stationLookup = new Map()) {
  if (!path?.length) {
    return {
      stopsCount: 0,
      distanceKm: 0,
      segments: [],
      transfers: []
    };
  }

  let currentSegment = null;
  const segments = [];
  const transfers = [];
  let previousRoute = null;
  let totalDistance = 0;

  for (let index = 0; index < path.length - 1; index += 1) {
    const fromId = path[index];
    const toId = path[index + 1];
    const key = `${fromId}|${toId}`;
    const candidateRoutes = edgeRoutes.get(key) ? Array.from(edgeRoutes.get(key)) : [];

    let chosenRoute = candidateRoutes[0] || previousRoute || 'Unknown route';
    if (previousRoute && candidateRoutes.includes(previousRoute)) {
      chosenRoute = previousRoute;
    }

    if (!currentSegment || currentSegment.route !== chosenRoute) {
      if (currentSegment) {
        segments.push(currentSegment);
      }
      const fromStation = stationLookup.get(fromId);
      const toStation = stationLookup.get(toId);
      currentSegment = {
        route: chosenRoute,
        routeLabel: ROUTE_LABELS[chosenRoute] || chosenRoute,
        from: fromId,
        to: toId,
        fromName: fromStation?.stop_name || fromId,
        toName: toStation?.stop_name || toId,
        stopIds: [fromId, toId]
      };
    } else {
      currentSegment.to = toId;
      currentSegment.toName = stationLookup.get(toId)?.stop_name || toId;
      currentSegment.stopIds.push(toId);
    }

    previousRoute = chosenRoute;

    const fromStation = stationLookup.get(fromId);
    const toStation = stationLookup.get(toId);
    if (fromStation && toStation) {
      totalDistance += haversineDistance(
        { lat: fromStation.stop_lat, lon: fromStation.stop_lon },
        { lat: toStation.stop_lat, lon: toStation.stop_lon }
      );
    }
  }

  if (currentSegment) {
    segments.push(currentSegment);
  }

  for (let idx = 1; idx < segments.length; idx += 1) {
    const previous = segments[idx - 1];
    const current = segments[idx];
    transfers.push({
      at: current.from,
      atName: current.fromName,
      fromRoute: previous.route,
      fromRouteLabel: previous.routeLabel,
      toRoute: current.route,
      toRouteLabel: current.routeLabel
    });
  }

  return {
    stopsCount: Math.max(path.length - 1, 0),
    distanceKm: Number(totalDistance.toFixed(2)),
    segments,
    transfers
  };
}

export function findRouteOptions(lines, stations, start, destination, maxPaths = 3) {
  const { adjacency, edgeRoutes } = buildRouteIndex(lines);
  const stationLookup = toStationLookup(stations);
  const paths = findKShortestPaths(adjacency, start, destination, maxPaths);

  return paths.map((path) => {
    const details = describePath(path, edgeRoutes, stationLookup);
    return {
      ...details,
      path
    };
  });
}

export function analysePathWithContext(path, lines, stations) {
  const { edgeRoutes } = buildRouteIndex(lines);
  const stationLookup = toStationLookup(stations);
  return describePath(path, edgeRoutes, stationLookup);
}
