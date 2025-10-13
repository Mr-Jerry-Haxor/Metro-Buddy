import { useMemo } from 'react';

function StationSelector({
  stations,
  fromStation,
  toStation,
  onFromChange,
  onToChange,
  canStart,
  onStart,
  notificationPermission
}) {
  const sortedStations = useMemo(
    () => [...stations].sort((a, b) => a.stop_name.localeCompare(b.stop_name)),
    [stations]
  );
  const stationById = useMemo(() => {
    return stations.reduce((acc, station) => {
      acc[station.stop_id] = station;
      return acc;
    }, {});
  }, [stations]);

  const selectedFrom = stationById[fromStation];
  const selectedTo = stationById[toStation];
  const notificationsEnabled = notificationPermission === 'granted';

  return (
    <section className="card">
      <div>
        <h2>Plan your journey</h2>
        <p>Select your start and destination stations to unlock live metro guidance.</p>
      </div>

      <div className="form-grid">
        <div className="form-field">
          <label htmlFor="from-select">From station</label>
          <select
            id="from-select"
            value={fromStation}
            onChange={(event) => onFromChange(event.target.value)}
          >
            <option value="">Select origin</option>
            {sortedStations.map((station) => (
              <option key={station.stop_id} value={station.stop_id}>
                {station.stop_name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="to-select">To station</label>
          <select
            id="to-select"
            value={toStation}
            onChange={(event) => onToChange(event.target.value)}
          >
            <option value="">Select destination</option>
            {sortedStations.map((station) => (
              <option key={station.stop_id} value={station.stop_id}>
                {station.stop_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="pill-row">
        {selectedFrom && <span className="pill">From: {selectedFrom.stop_name}</span>}
        {selectedTo && <span className="pill">To: {selectedTo.stop_name}</span>}
        <span className="pill">
          Notifications: {notificationsEnabled ? 'Enabled' : 'Tap start to allow'}
        </span>
      </div>

      <button className="action-button" type="button" disabled={!canStart} onClick={onStart}>
        Start Journey
      </button>

      <p className="hint">
        You will hear a gentle alert and feel a vibration when you are one stop or 500 m away from
        your destination.
      </p>
    </section>
  );
}

export default StationSelector;
