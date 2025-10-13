import { useEffect, useMemo, useState } from 'react';
import StationSelector from './components/StationSelector';
import Tracker from './components/Tracker';
import TripHistory from './components/TripHistory';
import Settings from './components/Settings';
import {
  addTrip,
  bulkUpsertStations,
  getPreference,
  savePreference
} from './db/indexedDB';
import {
  requestNotificationPermission,
  showPersistentNotification
} from './services/notifications';

const DEFAULT_PREFERENCES = {
  alarmDistanceMeters: 500,
  notificationSound: 'sine',
  theme: 'system'
};

const TABS = {
  JOURNEY: 'journey',
  HISTORY: 'history',
  SETTINGS: 'settings'
};

function App() {
  const [stations, setStations] = useState([]);
  const [fromStation, setFromStation] = useState('');
  const [toStation, setToStation] = useState('');
  const [lines, setLines] = useState([]);
  const [activeTab, setActiveTab] = useState(TABS.JOURNEY);
  const [journeyState, setJourneyState] = useState(null);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [notificationPermission, setNotificationPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [historyVersion, setHistoryVersion] = useState(0);

  useEffect(() => {
    async function hydrateStations() {
      try {
        const response = await fetch('/assets/hyderabad_metro_stations.json');
        const data = await response.json();
        setStations(data);
        await bulkUpsertStations(data);
        const lineResponse = await fetch('/assets/metro_lines.json');
        const lineData = await lineResponse.json();
        setLines(lineData);
      } catch (error) {
        console.error('Failed to hydrate station list', error);
      }
    }
    hydrateStations();
  }, []);

  useEffect(() => {
    async function hydratePreferences() {
      const alarmDistanceMeters = await getPreference(
        'alarmDistanceMeters',
        DEFAULT_PREFERENCES.alarmDistanceMeters
      );
      const notificationSound = await getPreference(
        'notificationSound',
        DEFAULT_PREFERENCES.notificationSound
      );
      const theme = await getPreference('theme', DEFAULT_PREFERENCES.theme);
      setPreferences({ alarmDistanceMeters, notificationSound, theme });
    }
    hydratePreferences();
  }, []);

  useEffect(() => {
    function syncNetworkStatus() {
      setIsOffline(!navigator.onLine);
    }
    window.addEventListener('online', syncNetworkStatus);
    window.addEventListener('offline', syncNetworkStatus);
    return () => {
      window.removeEventListener('online', syncNetworkStatus);
      window.removeEventListener('offline', syncNetworkStatus);
    };
  }, []);

  useEffect(() => {
    if (preferences.theme === 'dark') {
      document.documentElement.classList.add('dark-theme');
    } else if (preferences.theme === 'light') {
      document.documentElement.classList.remove('dark-theme');
    } else {
      document.documentElement.classList.remove('dark-theme');
    }
  }, [preferences.theme]);

  const canStartJourney = useMemo(
    () => Boolean(fromStation && toStation && fromStation !== toStation),
    [fromStation, toStation]
  );

  async function onStartJourney() {
    if (!canStartJourney) {
      return;
    }
    const permission = await requestNotificationPermission();
    setNotificationPermission(permission);
    const now = new Date().toISOString();
    const journey = {
      from: fromStation,
      to: toStation,
      startTime: now
    };
    setJourneyState(journey);
    setActiveTab(TABS.JOURNEY);
    await showPersistentNotification('Journey started', {
      body: `Journey started from ${fromStation} to ${toStation}`,
      data: { url: '/' }
    });
  }

  async function handleTripCompletion(tripMetrics) {
    const id = await addTrip(tripMetrics);
    setJourneyState(null);
    setActiveTab(TABS.HISTORY);
    setHistoryVersion((version) => version + 1);
    await showPersistentNotification('Trip saved to history', {
      body: `Trip ${tripMetrics.from} → ${tripMetrics.to} completed.`,
      data: { url: '/' }
    });
    return id;
  }

  async function updatePreference(key, value) {
    setPreferences((prev) => ({ ...prev, [key]: value }));
    await savePreference(key, value);
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <span className="status-pill">
          {isOffline ? '🔌 Offline ready' : '🟢 Live connection'}
        </span>
        <h1>Hyderabad Metro Smart Travel</h1>
        <p>
          Plan journeys, stay notified in real time, and keep a personal commute log on any device.
        </p>
      </header>
      <div className="main-shell">
        <nav className="tab-bar">
          <button
            type="button"
            className={activeTab === TABS.JOURNEY ? 'active' : ''}
            onClick={() => setActiveTab(TABS.JOURNEY)}
          >
            🚉 Journey
          </button>
          <button
            type="button"
            className={activeTab === TABS.HISTORY ? 'active' : ''}
            onClick={() => setActiveTab(TABS.HISTORY)}
          >
            🗂️ History
          </button>
          <button
            type="button"
            className={activeTab === TABS.SETTINGS ? 'active' : ''}
            onClick={() => setActiveTab(TABS.SETTINGS)}
          >
            ⚙️ Settings
          </button>
        </nav>

        {activeTab === TABS.JOURNEY && (
          <main className={journeyState ? 'content content--two-column' : 'content'}>
            <StationSelector
              stations={stations}
              fromStation={fromStation}
              toStation={toStation}
              onFromChange={setFromStation}
              onToChange={setToStation}
              canStart={canStartJourney}
              onStart={onStartJourney}
              notificationPermission={notificationPermission}
            />
            {journeyState && (
              <Tracker
                stations={stations}
                lines={lines}
                journey={journeyState}
                preferences={preferences}
                onCancel={() => setJourneyState(null)}
                onComplete={handleTripCompletion}
              />
            )}
          </main>
        )}

        {activeTab === TABS.HISTORY && (
          <main className="content">
            <TripHistory version={historyVersion} />
          </main>
        )}

        {activeTab === TABS.SETTINGS && (
          <main className="content">
            <Settings preferences={preferences} onPreferenceChange={updatePreference} />
          </main>
        )}
      </div>
    </div>
  );
}

export default App;
