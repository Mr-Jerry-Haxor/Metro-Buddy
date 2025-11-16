import { useEffect, useState } from 'react';
import { haversineDistance } from '../utils/distance';

function DynamicIsland({ journey, stations, position, currentNearest, nextStation, distanceToDestinationMeters }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (journey) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
      setIsExpanded(false);
    }
  }, [journey]);

  if (!isVisible || !journey) {
    return null;
  }

  const stationById = stations.reduce((acc, station) => ({ ...acc, [station.stop_id]: station }), {});
  const destinationStation = stationById[journey.to];
  const originStation = stationById[journey.from];

  const distanceToNextStation = nextStation && position
    ? Math.round(haversineDistance(
        { lat: position.coords.latitude, lon: position.coords.longitude },
        { lat: nextStation.stop_lat, lon: nextStation.stop_lon }
      ) * 1000)
    : null;

  return (
    <>
      <div
        className={`dynamic-island ${isExpanded ? 'expanded' : ''}`}
        onClick={() => setIsExpanded(!isExpanded)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setIsExpanded(!isExpanded)}
      >
        <div className="dynamic-island-compact">
          <div className="island-status-dot" />
          <span className="island-text">
            {currentNearest?.station?.stop_name || 'Tracking...'}
          </span>
          <span className="island-next">→ {destinationStation?.stop_name}</span>
        </div>

        {isExpanded && (
          <div className="dynamic-island-expanded">
            <div className="island-detail-row">
              <span className="island-label">From</span>
              <span className="island-value">{originStation?.stop_name}</span>
            </div>
            <div className="island-detail-row">
              <span className="island-label">Current</span>
              <span className="island-value">{currentNearest?.station?.stop_name || '—'}</span>
            </div>
            <div className="island-detail-row">
              <span className="island-label">Next</span>
              <span className="island-value">{nextStation?.stop_name || '—'}</span>
            </div>
            {distanceToNextStation !== null && (
              <div className="island-detail-row">
                <span className="island-label">Distance to next</span>
                <span className="island-value">{distanceToNextStation}m</span>
              </div>
            )}
            {distanceToDestinationMeters !== null && (
              <div className="island-detail-row">
                <span className="island-label">To destination</span>
                <span className="island-value">{(distanceToDestinationMeters / 1000).toFixed(2)} km</span>
              </div>
            )}
          </div>
        )}
      </div>
      {isExpanded && <div className="dynamic-island-backdrop" onClick={() => setIsExpanded(false)} />}
    </>
  );
}

export default DynamicIsland;
