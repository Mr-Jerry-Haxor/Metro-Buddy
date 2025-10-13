import { useEffect, useMemo, useRef, useState } from 'react';
import { useGeolocation } from '../hooks/useGeolocation';
import { useWakeLock } from '../hooks/useWakeLock';
import { findNearestStation, haversineDistance } from '../utils/distance';
import { getHistoricalEtaMinutes, predictEtaFromDistance } from '../utils/eta';
import { buildStationGraph, findShortestPath } from '../utils/graph';
import {
  playAlarm,
  stopAlarm,
  triggerVibration,
  updatePersistentNotification
} from '../services/notifications';

function Tracker({ stations, lines, journey, preferences, onCancel, onComplete }) {
  const stationById = useMemo(
    () => stations.reduce((acc, station) => ({ ...acc, [station.stop_id]: station }), {}),
    [stations]
  );

  const hasPlannedPath = Array.isArray(journey?.path) && journey.path.length > 1;

  const stationGraph = useMemo(() => {
    if (hasPlannedPath) {
      return null;
    }
    return buildStationGraph(lines);
  }, [hasPlannedPath, lines]);

  const pathStopIds = useMemo(() => {
    if (hasPlannedPath) {
      return journey.path;
    }
    if (!journey?.from || !journey?.to || !stationGraph) {
      return [];
    }
    return findShortestPath(stationGraph, journey.from, journey.to);
  }, [hasPlannedPath, journey.path, journey.from, journey.to, stationGraph]);

  const orderedStationDetails = useMemo(() => {
    return pathStopIds.map((stopId) => stationById[stopId]).filter(Boolean);
  }, [pathStopIds, stationById]);

  const pathIndexByStopId = useMemo(() => {
    return new Map(pathStopIds.map((stopId, index) => [stopId, index]));
  }, [pathStopIds]);

  const destinationStation = stationById[journey.to];
  const originStation = stationById[journey.from];

  const { position, error, isWatching, stopWatching } = useGeolocation(Boolean(journey));
  useWakeLock(true);

  const [etaMinutes, setEtaMinutes] = useState(null);
  const [predictedMinutes, setPredictedMinutes] = useState(null);
  const [alertTriggered, setAlertTriggered] = useState(false);
  const [distanceDisplayKm, setDistanceDisplayKm] = useState(0);

  const alarmCleanupRef = useRef(null);
  const previousNearestRef = useRef(null);
  const lastPositionRef = useRef(null);
  const distanceTravelledKmRef = useRef(0);
  const completeRef = useRef(false);
  const offlineSimulatedRef = useRef(false);
  const offlineTimeoutRef = useRef(null);

  useEffect(() => {
    previousNearestRef.current = null;
    lastPositionRef.current = null;
    distanceTravelledKmRef.current = 0;
    setDistanceDisplayKm(0);
    completeRef.current = false;
    offlineSimulatedRef.current = false;
    setAlertTriggered(false);
  }, [journey.startTime]);

  const currentNearest = useMemo(() => {
    if (!position || !orderedStationDetails.length) {
      return previousNearestRef.current;
    }
    const nearest = findNearestStation(position, orderedStationDetails);
    if (nearest?.station) {
      previousNearestRef.current = nearest;
    }
    return nearest || null;
  }, [orderedStationDetails, position]);

  const nearestIndex = useMemo(() => {
    if (!currentNearest?.station) {
      return -1;
    }
    return orderedStationDetails.findIndex((station) => station.stop_id === currentNearest.station.stop_id);
  }, [currentNearest, orderedStationDetails]);

  const previousStation = nearestIndex > 0 ? orderedStationDetails[nearestIndex - 1] : null;
  const nextStation =
    nearestIndex >= 0 && nearestIndex < orderedStationDetails.length - 1
      ? orderedStationDetails[nearestIndex + 1]
      : null;

  const routeMissing = orderedStationDetails.length <= 1;
  const calculatedStopsBetween = orderedStationDetails.length > 0 ? orderedStationDetails.length - 1 : 0;
  const stopsBetween = journey.plannedStops ?? calculatedStopsBetween;
  const remainingStops = nearestIndex >= 0 ? Math.max(stopsBetween - nearestIndex, 0) : stopsBetween;
  const plannedDistanceKm = journey.plannedDistanceKm ?? null;
  const plannedSegments = journey.plannedSegments ?? [];
  const plannedTransfers = journey.plannedTransfers ?? [];
  const transfersRemaining = useMemo(() => {
    if (!plannedTransfers.length) {
      return 0;
    }
    const currentIndex = nearestIndex >= 0 ? nearestIndex : -1;
    return plannedTransfers.filter((transfer) => {
      const transferIndex = pathIndexByStopId.get(transfer.at);
      return typeof transferIndex === 'number' && transferIndex > currentIndex;
    }).length;
  }, [nearestIndex, pathIndexByStopId, plannedTransfers]);

  const activeSegmentIndex = useMemo(() => {
    if (!plannedSegments.length) {
      return -1;
    }
    const currentStopId = currentNearest?.station?.stop_id;
    if (!currentStopId) {
      return 0;
    }
    return plannedSegments.findIndex((segment) => segment.stopIds.includes(currentStopId));
  }, [currentNearest, plannedSegments]);

  const activeSegment = activeSegmentIndex >= 0 ? plannedSegments[activeSegmentIndex] : plannedSegments[0] ?? null;

  const nextTransfer = useMemo(() => {
    if (!plannedTransfers.length) {
      return null;
    }
    const currentIndex = nearestIndex >= 0 ? nearestIndex : -1;
    for (const transfer of plannedTransfers) {
      const transferIndex = pathIndexByStopId.get(transfer.at);
      if (typeof transferIndex === 'number' && transferIndex > currentIndex) {
        return transfer;
      }
    }
    return null;
  }, [nearestIndex, pathIndexByStopId, plannedTransfers]);

  const friendlyErrorMessage = useMemo(() => {
    if (!error) {
      return null;
    }
    if (typeof error.code === 'number' && error.code === 1) {
      return 'Location permission denied. Please allow location access to enable live tracking.';
    }
    const message = String(error.message || '').toLowerCase();
    if (message.includes('secure') || message.includes('https')) {
      return 'Location requires a secure context. Serve the app via https or localhost (npm run dev / npx serve docs).';
    }
    if (message.includes('not supported')) {
      return 'Geolocation is unavailable in this browser session. Try a modern browser or enable HTTPS.';
    }
    return error.message || 'Geolocation error occurred.';
  }, [error]);

  const distanceToDestinationMeters = useMemo(() => {
    if (!position || !destinationStation) {
      return null;
    }
    const current = {
      lat: position.coords.latitude,
      lon: position.coords.longitude
    };
    const destination = {
      lat: destinationStation.stop_lat,
      lon: destinationStation.stop_lon
    };
    return Math.round(haversineDistance(current, destination) * 1000);
  }, [destinationStation, position]);

  useEffect(() => {
    let cancelled = false;
    async function loadHistoricalEta() {
      const value = await getHistoricalEtaMinutes(journey.from, journey.to);
      if (!cancelled) {
        setEtaMinutes(value);
      }
    }
    loadHistoricalEta();
    return () => {
      cancelled = true;
    };
  }, [journey.from, journey.to]);

  useEffect(() => {
    if (!distanceToDestinationMeters) {
      setPredictedMinutes(null);
      return;
    }
    const km = distanceToDestinationMeters / 1000;
    const fallback = etaMinutes || undefined;
    setPredictedMinutes(predictEtaFromDistance(km, fallback));
  }, [distanceToDestinationMeters, etaMinutes]);

  useEffect(() => {
    if (!position) {
      return;
    }
    const lastPosition = lastPositionRef.current;
    if (lastPosition) {
      const delta = haversineDistance(
        { lat: lastPosition.coords.latitude, lon: lastPosition.coords.longitude },
        { lat: position.coords.latitude, lon: position.coords.longitude }
      );
      if (delta < 5) {
        distanceTravelledKmRef.current += delta;
        setDistanceDisplayKm(Number(distanceTravelledKmRef.current.toFixed(2)));
      }
    }
    lastPositionRef.current = position;
  }, [currentNearest, position]);

  useEffect(() => {
    if (!currentNearest?.station && !nextStation) {
      return;
    }
    const title = 'Metro tracker';
    const bodyParts = [];
    if (previousStation) {
      bodyParts.push(`🟩 Last stop: ${previousStation.stop_name}`);
    }
    if (currentNearest?.station) {
      bodyParts.push(`🟨 Current: ${currentNearest.station.stop_name}`);
    }
    if (nextStation) {
      bodyParts.push(`🟥 Next: ${nextStation.stop_name}`);
    }
    if (activeSegment?.routeLabel) {
      bodyParts.push(`🚇 Line: ${activeSegment.routeLabel}`);
    }
    updatePersistentNotification({ title, body: bodyParts.join('\n') });
  }, [activeSegment, currentNearest, nextStation, previousStation]);

  useEffect(() => {
    if (!nextStation || !preferences?.alarmDistanceMeters) {
      return;
    }
    const nearDestination =
      distanceToDestinationMeters !== null &&
      distanceToDestinationMeters <= preferences.alarmDistanceMeters;
    const oneStopAway = nextStation?.stop_id === destinationStation?.stop_id;

    if ((nearDestination || oneStopAway) && !alertTriggered) {
      triggerVibration([300, 120, 300, 120, 600]);
      if (preferences.notificationSound !== 'mute') {
        alarmCleanupRef.current = playAlarm(preferences.notificationSound);
      }
      setAlertTriggered(true);
    }
  }, [
    alertTriggered,
    destinationStation,
    distanceToDestinationMeters,
    nextStation,
    preferences.alarmDistanceMeters,
    preferences.notificationSound
  ]);

  useEffect(() => {
    return () => {
      alarmCleanupRef.current?.();
      stopAlarm();
      stopWatching();
    };
  }, [stopWatching]);

  useEffect(() => {
    if (!destinationStation || distanceToDestinationMeters === null) {
      return;
    }
    if (
      !completeRef.current &&
      currentNearest?.station?.stop_id === destinationStation.stop_id &&
      distanceToDestinationMeters <= 120
    ) {
      completeRef.current = true;
      alarmCleanupRef.current?.();
      stopAlarm();
      triggerVibration([400, 140, 600, 140, 800]);
      const endTime = new Date().toISOString();
      const durationMinutes = Math.max(
        1,
        Math.round((Date.parse(endTime) - Date.parse(journey.startTime)) / 60000)
      );
      onComplete({
        from: journey.from,
        to: journey.to,
        startTime: journey.startTime,
        endTime,
        duration: durationMinutes,
        distance: Number(distanceTravelledKmRef.current.toFixed(2)),
        plannedStops: journey.plannedStops ?? null,
        plannedDistance: journey.plannedDistanceKm ?? null,
        transfers: plannedTransfers.length,
        path: pathStopIds
      });
    }
  }, [currentNearest, destinationStation, distanceToDestinationMeters, journey.plannedDistanceKm, journey.plannedStops, journey.startTime, journey.to, onComplete, pathStopIds, plannedTransfers.length]);

  useEffect(() => {
    if (!position && !offlineSimulatedRef.current && etaMinutes) {
      offlineSimulatedRef.current = true;
      const durationMs = etaMinutes * 60 * 1000;
      offlineTimeoutRef.current = setTimeout(() => {
        if (!completeRef.current) {
          const endTime = new Date(Date.parse(journey.startTime) + durationMs).toISOString();
          onComplete({
            from: journey.from,
            to: journey.to,
            startTime: journey.startTime,
            endTime,
            duration: etaMinutes,
            distance: Number(distanceTravelledKmRef.current.toFixed(2)),
            simulated: true,
            plannedStops: journey.plannedStops ?? null,
            plannedDistance: journey.plannedDistanceKm ?? null,
            transfers: plannedTransfers.length,
            path: pathStopIds
          });
        }
      }, durationMs);
    }
    return () => {
      if (offlineTimeoutRef.current) {
        clearTimeout(offlineTimeoutRef.current);
        offlineTimeoutRef.current = null;
      }
    };
  }, [etaMinutes, journey.from, journey.startTime, journey.to, onComplete, position]);

  return (
    <section className="card">
      <div>
        <h2>Live journey</h2>
        <p>
          Tracking from <strong>{originStation?.stop_name ?? journey.from}</strong> to{' '}
          <strong>{destinationStation?.stop_name ?? journey.to}</strong>. Relax, we will alert you in
          time.
        </p>
      </div>

      <div className="pill-row">
        <span className="pill">
          Planned stops: {Number.isFinite(stopsBetween) ? stopsBetween : '—'}
        </span>
        <span className="pill">
          Remaining stops: {Number.isFinite(remainingStops) ? remainingStops : '—'}
        </span>
        <span className="pill">
          Transfers: {plannedTransfers.length ? `${transfersRemaining} of ${plannedTransfers.length} left` : 'None'}
        </span>
        {plannedDistanceKm != null && <span className="pill">Route distance: {plannedDistanceKm.toFixed(2)} km</span>}
        {etaMinutes && <span className="pill">Avg ETA: {Math.round(etaMinutes)} min</span>}
        {predictedMinutes && <span className="pill">Live ETA: {predictedMinutes} min</span>}
      </div>

      {routeMissing && (
        <div className="status-banner warning">
          Unable to map this route precisely. Distance and proximity alerts will still work.
        </div>
      )}

      {friendlyErrorMessage && <div className="status-banner error">{friendlyErrorMessage}</div>}

      {(activeSegment || nextTransfer) && (
        <div className="status-banner info">
          {activeSegment && (
            <span>
              Stay on {activeSegment.routeLabel} towards {activeSegment.toName}
            </span>
          )}
          {nextTransfer && (
            <span>
              Next transfer at <strong>{nextTransfer.atName}</strong> ({nextTransfer.fromRouteLabel} →{' '}
              {nextTransfer.toRouteLabel})
            </span>
          )}
        </div>
      )}

      <div className="metrics-grid">
        <div className="metric-card">
          <h4>Current stop</h4>
          <p>{currentNearest?.station?.stop_name ?? 'Locating...'}</p>
        </div>
        <div className="metric-card">
          <h4>Next stop</h4>
          <p>{nextStation?.stop_name ?? '—'}</p>
        </div>
        <div className="metric-card">
          <h4>Stops remaining</h4>
          <p>{remainingStops ?? '—'}</p>
        </div>
        <div className="metric-card">
          <h4>Transfers left</h4>
          <p>{plannedTransfers.length ? transfersRemaining : 0}</p>
        </div>
        <div className="metric-card">
          <h4>Distance to destination</h4>
          <p>
            {distanceToDestinationMeters !== null
              ? `${(distanceToDestinationMeters / 1000).toFixed(2)} km`
              : 'Calculating...'}
          </p>
        </div>
        <div className="metric-card">
          <h4>ETA</h4>
          <p>
            {predictedMinutes ? `${predictedMinutes} min` : etaMinutes ? `${etaMinutes} min` : '—'}
          </p>
        </div>
        <div className="metric-card">
          <h4>Distance covered</h4>
          <p>{distanceDisplayKm.toFixed(2)} km</p>
        </div>
        <div className="metric-card">
          <h4>Active line</h4>
          <p>{activeSegment?.routeLabel ?? '—'}</p>
        </div>
        <div className="metric-card">
          <h4>GPS status</h4>
          <p>{isWatching ? 'Tracking' : 'Paused'}</p>
        </div>
      </div>

      {plannedSegments.length ? (
        <div className="route-plan">
          <h3>Route plan</h3>
          <ol className="route-plan-list">
            {plannedSegments.map((segment, index) => {
              const stopCount = Math.max(segment.stopIds.length - 1, 0);
              const isCurrent = index === activeSegmentIndex;
              return (
                <li key={`${segment.route}-${segment.from}-${segment.to}-${index}`} className={isCurrent ? 'current' : ''}>
                  <div className="route-plan-line">{segment.routeLabel}</div>
                  <div className="route-plan-details">
                    {segment.fromName} → {segment.toName}
                  </div>
                  <div className="route-plan-meta">
                    {stopCount} {stopCount === 1 ? 'stop' : 'stops'}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      <button type="button" className="action-button" onClick={onCancel}>
        End Journey
      </button>
    </section>
  );
}

export default Tracker;
