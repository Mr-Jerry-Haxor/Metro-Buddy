import { useMemo } from 'react';

function StationSelector({
  stations,
  fromStation,
  toStation,
  onFromChange,
  onToChange,
  canStart,
  onStart,
  notificationPermission,
  routeOptions,
  selectedRouteIndex,
  onSelectRoute,
  isLoading,
  fare
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

  function swapStations() {
    onFromChange(toStation);
    onToChange(fromStation);
  }

  return (
    <section className="card planner-card">
      <div className="planner-intro">
        <div>
          <p className="eyebrow">Plan a ride</p>
        <h2>Plan your journey</h2>
          <p>Choose your stations. We will map the line, transfers, alerts, and your live ride.</p>
        </div>
        <div className="planner-illustration" aria-hidden="true">
          <span className="planner-line" />
          <span className="planner-train">M</span>
        </div>
      </div>

      <div className="station-picker">
        <div className="form-field">
          <label htmlFor="from-select">From station</label>
          <select
            id="from-select"
            value={fromStation}
            onChange={(event) => onFromChange(event.target.value)}
          >
            <option value="">{isLoading ? 'Loading stations…' : 'Select origin'}</option>
            {sortedStations.map((station) => (
              <option key={station.stop_id} value={station.stop_id}>
                {station.stop_name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="swap-button"
          onClick={swapStations}
          disabled={!fromStation && !toStation}
          aria-label="Swap origin and destination"
        >
          ⇄
        </button>

        <div className="form-field">
          <label htmlFor="to-select">To station</label>
          <select
            id="to-select"
            value={toStation}
            onChange={(event) => onToChange(event.target.value)}
          >
            <option value="">{isLoading ? 'Loading stations…' : 'Select destination'}</option>
            {sortedStations.map((station) => (
              <option key={station.stop_id} value={station.stop_id}>
                {station.stop_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {(selectedFrom || selectedTo) && (
        <div className="selection-summary">
          <span><i className="summary-dot summary-dot--from" />{selectedFrom?.stop_name || 'Choose origin'}</span>
          <span aria-hidden="true">→</span>
          <span><i className="summary-dot summary-dot--to" />{selectedTo?.stop_name || 'Choose destination'}</span>
        </div>
      )}

      {fromStation && toStation && fromStation !== toStation && (
        <div className="route-options">
          {routeOptions?.length ? (
            routeOptions.map((option, index) => {
              const isActive = index === selectedRouteIndex;
              return (
                <button
                  key={option.path.join('-')}
                  type="button"
                  className={`route-option ${isActive ? 'active' : ''}`}
                  onClick={() => onSelectRoute(index)}
                >
                  <div className="route-option-header">
                    <span className="route-option-title">{index === 0 ? 'Fastest route' : `Alternate ${index}`}</span>
                    <span className="route-option-subtitle">
                      {option.stopsCount} {option.stopsCount === 1 ? 'stop' : 'stops'} •{' '}
                      {option.distanceKm.toFixed(2)} km{Number.isFinite(fare) ? ` • ₹${fare}` : ''}
                    </span>
                  </div>
                  <div className="route-option-legs">
                    {option.segments.map((segment, segmentIndex) => (
                      <span key={`${segment.route}-${segment.from}-${segmentIndex}`}>
                        <strong>{segment.routeLabel}</strong> {segment.fromName} → {segment.toName}
                        {segment.stopIds.length > 1 ? ` (${segment.stopIds.length - 1} stops)` : ''}
                        {segmentIndex < option.segments.length - 1 ? ' • ' : ''}
                      </span>
                    ))}
                  </div>
                  <div className="route-option-transfers">
                    {option.transfers.length ? (
                      option.transfers.map((transfer) => (
                        <span key={`${transfer.at}-${transfer.toRoute}`}>
                          Change at {transfer.atName} ({transfer.fromRouteLabel} → {transfer.toRouteLabel})
                        </span>
                      ))
                    ) : (
                      <span>No transfers required</span>
                    )}
                  </div>
                </button>
              );
            })
          ) : (
            <div className="status-banner warning">
              No direct journey found yet. Adjust your selection or try nearby stations.
            </div>
          )}
        </div>
      )}

      <button className="action-button" type="button" disabled={!canStart || isLoading} onClick={onStart}>
        <span>Start live journey</span><span aria-hidden="true">→</span>
      </button>

      <div className="planner-footnote">
        <span aria-hidden="true">◉</span>
        <p>{notificationsEnabled ? 'Station alerts are ready.' : 'Starting asks for notification access.'} You will be warned one stop before arrival.</p>
      </div>
    </section>
  );
}

export default StationSelector;
