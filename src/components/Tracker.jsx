import { useEffect, useMemo, useRef, useState } from 'react';
import { useGeolocation } from '../hooks/useGeolocation';
import { useWakeLock } from '../hooks/useWakeLock';
import { findNearestStation, haversineDistance } from '../utils/distance';
import { getHistoricalEtaMinutes, predictEtaFromDistance } from '../utils/eta';
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

  const route = useMemo(() => {
    if (!lines?.length) {
      return null;
    }
    const match = lines.find((line) => {
      const ids = line.stations.map((station) => station.stop_id);
      return ids.includes(journey.from) && ids.includes(journey.to);
    });
    if (!match) {
      return null;
    }
    const ids = match.stations.map((station) => station.stop_id);
    const fromIdx = ids.indexOf(journey.from);
    const toIdx = ids.indexOf(journey.to);
    if (fromIdx === -1 || toIdx === -1) {
      return null;
    }
    const forward = fromIdx <= toIdx;
    const ordered = forward
      ? match.stations.slice(fromIdx, toIdx + 1)
      : [...match.stations.slice(toIdx, fromIdx + 1)].reverse();
    return {
      ...match,
      orderedStations: ordered
    };
  }, [journey.from, journey.to, lines]);

  const orderedStationDetails = useMemo(() => {
    if (!route) {
      return [];
    }
    return route.orderedStations
      .map((station) => stationById[station.stop_id])
      .filter(Boolean);
  }, [route, stationById]);

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

  const routeMissing = !route || !orderedStationDetails.length;
  const totalStops = route?.orderedStations?.length ?? 0;

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
    updatePersistentNotification({ title, body: bodyParts.join('\n') });
  }, [currentNearest, nextStation, previousStation]);

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
        distance: Number(distanceTravelledKmRef.current.toFixed(2))
      });
    }
  }, [currentNearest, destinationStation, distanceToDestinationMeters, journey.startTime, journey.to, onComplete]);

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
            simulated: true
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
        <span className="pill">Stops: {totalStops || '—'}</span>
        {etaMinutes && <span className="pill">Avg ETA: {Math.round(etaMinutes)} min</span>}
        {predictedMinutes && <span className="pill">Live ETA: {predictedMinutes} min</span>}
      </div>

      {routeMissing && (
        <div className="status-banner warning">
          Unable to map this route precisely. Distance and proximity alerts will still work.
        </div>
      )}

      {error && <div className="status-banner error">Geolocation error: {error.message}</div>}

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
          <h4>GPS status</h4>
          <p>{isWatching ? 'Tracking' : 'Paused'}</p>
        </div>
      </div>

      <button type="button" className="action-button" onClick={onCancel}>
        End Journey
      </button>
    </section>
  );
}

export default Tracker;
