import { useEffect, useState } from 'react';
import { getTrips } from '../db/indexedDB';

function TripHistory({ version }) {
  const [trips, setTrips] = useState([]);

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
      <section className="card">
        <h2>Trip history</h2>
        <div className="status-banner warning">No trips logged yet. Start a journey to save it here.</div>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>Trip history</h2>
      <div className="history-list">
        {trips.map((trip) => (
          <article key={trip.id} className="history-item">
            <strong>
              {trip.from} → {trip.to}
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
