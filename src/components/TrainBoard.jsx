import { useEffect, useMemo, useState } from 'react';
import {
  buildScheduleIndex,
  formatServiceTime,
  getEstimatedTrainPositions,
  getServiceState,
  getStationServiceSpan,
  getUpcomingDepartures
} from '../utils/schedule';

const LINE_ORDER = ['RED', 'GREEN', 'BLUE'];
const LINE_LABELS = { RED: 'Red Line', GREEN: 'Green Line', BLUE: 'Blue Line' };
const LINE_FREQUENCIES = {
  RED: 'about every 4 min at peak',
  GREEN: 'about every 12 min at peak',
  BLUE: 'about every 4 min at peak'
};

function TrainBoard({ schedule, stations, initialStation, error }) {
  const [selectedStation, setSelectedStation] = useState(initialStation || 'AME');
  const [selectedLine, setSelectedLine] = useState('ALL');
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (initialStation) {
      setSelectedStation(initialStation);
    }
  }, [initialStation]);

  const stationById = useMemo(
    () => new Map(stations.map((station) => [station.stop_id, station])),
    [stations]
  );
  const sortedStations = useMemo(
    () => [...stations].sort((left, right) => left.stop_name.localeCompare(right.stop_name)),
    [stations]
  );
  const scheduleIndex = useMemo(
    () => (schedule ? buildScheduleIndex(schedule) : null),
    [schedule]
  );
  const serviceState = useMemo(() => getServiceState(now), [now]);
  const departures = useMemo(
    () => getUpcomingDepartures(scheduleIndex, selectedStation, now, 18),
    [now, scheduleIndex, selectedStation]
  );
  const visibleDepartures = useMemo(
    () => departures.filter((departure) => selectedLine === 'ALL' || departure.routeId === selectedLine).slice(0, 8),
    [departures, selectedLine]
  );
  const serviceSpans = useMemo(
    () => getStationServiceSpan(scheduleIndex, selectedStation, now),
    [now, scheduleIndex, selectedStation]
  );
  const estimatedTrains = useMemo(
    () => getEstimatedTrainPositions(scheduleIndex, now),
    [now, scheduleIndex]
  );
  const visibleTrains = useMemo(
    () => estimatedTrains.filter((train) => selectedLine === 'ALL' || train.routeId === selectedLine).slice(0, 10),
    [estimatedTrains, selectedLine]
  );
  const trainCounts = useMemo(
    () => estimatedTrains.reduce((counts, train) => {
      counts[train.routeId] = (counts[train.routeId] || 0) + 1;
      return counts;
    }, {}),
    [estimatedTrains]
  );
  const selectedStationName = stationById.get(selectedStation)?.stop_name || 'Selected station';

  if (!schedule) {
    return (
      <main className="content">
        <section className="card empty-state">
          <div className="empty-state-icon" aria-hidden="true">⌁</div>
          <p className="eyebrow">Official timetable</p>
          <h2>{error ? 'Timetable unavailable' : 'Loading train data'}</h2>
          <p>{error || 'Preparing the HMRL schedule and station boards…'}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="content train-board-page">
      <section className="card operations-hero">
        <div className="operations-heading">
          <div>
            <p className="eyebrow">Hyderabad Metro operations</p>
            <h2>Trains &amp; departures</h2>
            <p>Official HMRL timetable data, refreshed on your screen every 15 seconds.</p>
          </div>
          <div className="service-clock" aria-live="polite">
            <span>Hyderabad time</span>
            <strong>{serviceState.clock.timeLabel}</strong>
            <small>{serviceState.label}</small>
          </div>
        </div>

        <div className="metro-line-summary">
          {LINE_ORDER.map((routeId) => (
            <button
              type="button"
              key={routeId}
              className={`metro-line-card line-${routeId.toLowerCase()} ${selectedLine === routeId ? 'is-selected' : ''}`}
              onClick={() => setSelectedLine(selectedLine === routeId ? 'ALL' : routeId)}
            >
              <span>{LINE_LABELS[routeId]}</span>
              <strong>{trainCounts[routeId] || 0} estimated trains</strong>
              <small>{LINE_FREQUENCIES[routeId]}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="train-board-grid">
        <article className="card departure-board">
          <div className="board-heading">
            <div>
              <p className="eyebrow">Next trains</p>
              <h2>{selectedStationName}</h2>
            </div>
            <label className="compact-select">
              <span>Station</span>
              <select value={selectedStation} onChange={(event) => setSelectedStation(event.target.value)}>
                {sortedStations.map((station) => (
                  <option key={station.stop_id} value={station.stop_id}>{station.stop_name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="data-badge-row">
            <span className="data-badge scheduled">Scheduled</span>
            <span>Times are from the official HMRL GTFS feed—not a live platform sensor.</span>
          </div>

          {visibleDepartures.length ? (
            <div className="departure-list" aria-live="polite">
              {visibleDepartures.map((departure) => (
                <div className="departure-row" key={`${departure.trip.id}-${departure.callIndex}`}>
                  <span className={`line-marker line-${departure.routeId.toLowerCase()}`} aria-hidden="true" />
                  <div className="departure-destination">
                    <strong>Towards {departure.headsign}</strong>
                    <span>{departure.lineName}{departure.platform ? ` · Platform ${departure.platform}` : ''}</span>
                  </div>
                  <div className="departure-time">
                    <strong>{departure.minutesAway === 0 ? 'Due' : `${departure.minutesAway} min`}</strong>
                    <span>{departure.timeLabel}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="status-banner warning">
              No more scheduled departures for this filter today. Select another line or check the first service below.
            </div>
          )}
        </article>

        <article className="card service-details-card">
          <div>
            <p className="eyebrow">First &amp; last train</p>
            <h2>Station service</h2>
          </div>
          <div className="service-span-list">
            {serviceSpans.map((span) => (
              <div className="service-span" key={`${span.routeId}-${span.headsign}`}>
                <span className={`line-marker line-${span.routeId.toLowerCase()}`} aria-hidden="true" />
                <div>
                  <strong>{span.headsign}</strong>
                  <span>{span.lineName}{span.platform ? ` · Platform ${span.platform}` : ''}</span>
                </div>
                <dl>
                  <div><dt>First</dt><dd>{formatServiceTime(span.first)}</dd></div>
                  <div><dt>Last</dt><dd>{formatServiceTime(span.last)}</dd></div>
                </dl>
              </div>
            ))}
          </div>
          <div className="official-help">
            <strong>Need a confirmed disruption update?</strong>
            <p>HMRL does not publish a public live incident API. Check station displays and announcements, or call the official helpline.</p>
            <div>
              <a href="tel:+914023332555">Call +91 40 2333 2555</a>
              <a href="https://ltmetro.com/faqs/" target="_blank" rel="noreferrer">Official travel FAQ ↗</a>
            </div>
          </div>
        </article>
      </section>

      <section className="card estimated-trains-card">
        <div className="board-heading">
          <div>
            <p className="eyebrow">Network movement</p>
            <h2>Estimated train positions</h2>
          </div>
          <button type="button" className="line-filter-button" onClick={() => setSelectedLine('ALL')}>
            {selectedLine === 'ALL' ? 'All lines' : `Clear ${selectedLine.toLowerCase()} filter`}
          </button>
        </div>
        <div className="estimate-warning">
          <span aria-hidden="true">i</span>
          <p><strong>Timetable estimate.</strong> These positions interpolate scheduled GTFS station times. They are not train GPS and cannot show delays.</p>
        </div>
        {visibleTrains.length ? (
          <div className="estimated-train-list">
            {visibleTrains.map((train) => {
              const fromName = stationById.get(train.fromStationId)?.stop_name || train.fromStationId;
              const toName = stationById.get(train.toStationId)?.stop_name || train.toStationId;
              return (
                <article className="estimated-train" key={train.id}>
                  <div className="estimated-train-topline">
                    <span className={`line-chip line-${train.routeId.toLowerCase()}`}>{train.lineName}</span>
                    <span>Towards {train.headsign}</span>
                  </div>
                  <strong>{fromName} <span>→</span> {toName}</strong>
                  <div className="train-progress" aria-label={`${Math.round(train.progress * 100)} percent to ${toName}`}>
                    <span style={{ width: `${Math.max(train.progress * 100, 4)}%` }} />
                  </div>
                  <p>{train.dueMinutes === 0 ? `Scheduled at ${toName} now` : `${train.dueMinutes} min to ${toName}`} · {train.nextTimeLabel}</p>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="status-banner warning">No trains are scheduled to be moving at this time.</div>
        )}
      </section>

      <section className="source-disclosure">
        <div>
          <strong>{schedule.meta.attribution}</strong>
          <span>Feed validity: {schedule.meta.feedStartDate}–{schedule.meta.feedEndDate}</span>
        </div>
        <a href={schedule.meta.sourceUrl} target="_blank" rel="noreferrer">HMRL Open Data ↗</a>
      </section>
    </main>
  );
}

export default TrainBoard;
