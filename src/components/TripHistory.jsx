import { useEffect, useState } from 'react';
import { getTrips } from '../db/indexedDB';

function TripHistory({ version, stations = [] }) {
  const [trips, setTrips] = useState([]);
  const stationNames = new Map(stations.map((station) => [station.stop_id, station.stop_name]));

  useEffect(() => {
    let isMounted = true;
    async function loadTrips() {
      const data = await getTrips();
      if (isMounted) {
        setTrips(data);
      }
    }
    loadTrips();
    return () => {
      isMounted = false;
    };
  }, [version]);

  if (!trips.length) {
    return (
      <section className="card empty-state">
        <div className="empty-state-icon" aria-hidden="true">↺</div>
        <p className="eyebrow">Your rides</p>
        <h2>No journeys yet</h2>
        <p>Your completed Metro journeys will appear here with time and distance summaries.</p>
      </section>
    );
  }

  return (
    <section className="card">
      <p className="eyebrow">Your rides</p>
      <h2>Trip history</h2>
      <div className="history-list">
        {trips.map((trip) => (
          <article key={trip.id} className="history-item">
            <strong>
              {stationNames.get(trip.from) || trip.from} → {stationNames.get(trip.to) || trip.to}
            </strong>
            <div className="pill-row">
              <span className="pill">Departed: {new Date(trip.startTime).toLocaleString()}</span>
              <span className="pill">Duration: {trip.duration} min</span>
              <span className="pill">
                Distance: {trip.distance != null ? Number(trip.distance).toFixed(1) : '0.0'} km
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default TripHistory;
