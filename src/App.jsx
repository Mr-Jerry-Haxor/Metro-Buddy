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
import { findRouteOptions } from './utils/routes';

const DEFAULT_PREFERENCES = {
  alarmDistanceMeters: 500,
  notificationSound: 'sine',
  theme: 'system',
  voiceAnnouncements: false,
  voicePrimaryLang: 'te-IN',
  voiceSecondaryLang: 'en-IN',
  voicePrimaryVoice: '',
  voiceSecondaryVoice: '',
  voiceRate: 1,
  voicePitch: 1,
  voiceVolume: 1,
  voiceCustomPack: null
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
  const [routeOptions, setRouteOptions] = useState([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);

  useEffect(() => {
    async function hydrateStations() {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}assets/hyderabad_metro_stations.json`);
        const data = await response.json();
        setStations(data);
        await bulkUpsertStations(data);
        const lineResponse = await fetch(`${import.meta.env.BASE_URL}assets/metro_lines.json`);
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
      const voiceAnnouncements = await getPreference(
        'voiceAnnouncements',
        DEFAULT_PREFERENCES.voiceAnnouncements
      );
      const voicePrimaryLang = await getPreference(
        'voicePrimaryLang',
        DEFAULT_PREFERENCES.voicePrimaryLang
      );
      const voiceSecondaryLang = await getPreference(
        'voiceSecondaryLang',
        DEFAULT_PREFERENCES.voiceSecondaryLang
      );
      const voicePrimaryVoice = await getPreference(
        'voicePrimaryVoice',
        DEFAULT_PREFERENCES.voicePrimaryVoice
      );
      const voiceSecondaryVoice = await getPreference(
        'voiceSecondaryVoice',
        DEFAULT_PREFERENCES.voiceSecondaryVoice
      );
      const voiceRate = await getPreference('voiceRate', DEFAULT_PREFERENCES.voiceRate);
      const voicePitch = await getPreference('voicePitch', DEFAULT_PREFERENCES.voicePitch);
      const voiceVolume = await getPreference('voiceVolume', DEFAULT_PREFERENCES.voiceVolume);
      const voiceCustomPack = await getPreference(
        'voiceCustomPack',
        DEFAULT_PREFERENCES.voiceCustomPack
      );
      setPreferences({
        alarmDistanceMeters,
        notificationSound,
        theme,
        voiceAnnouncements,
        voicePrimaryLang,
        voiceSecondaryLang,
        voicePrimaryVoice,
        voiceSecondaryVoice,
        voiceRate,
        voicePitch,
        voiceVolume,
        voiceCustomPack
      });
    }
    hydratePreferences();
  }, []);

  useEffect(() => {
    if (!stations.length || !lines.length || !fromStation || !toStation || fromStation === toStation) {
      setRouteOptions([]);
      setSelectedRouteIndex(0);
      return;
    }

    try {
      const options = findRouteOptions(lines, stations, fromStation, toStation, 4);
      setRouteOptions(options);
      setSelectedRouteIndex(0);
    } catch (error) {
      console.error('Failed to compute route options', error);
      setRouteOptions([]);
      setSelectedRouteIndex(0);
    }
  }, [stations, lines, fromStation, toStation]);

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
    () =>
      Boolean(
        fromStation &&
          toStation &&
          fromStation !== toStation &&
          routeOptions.length &&
          routeOptions[selectedRouteIndex]
      ),
    [fromStation, toStation, routeOptions, selectedRouteIndex]
  );

  async function onStartJourney() {
    if (!canStartJourney) {
      return;
    }
    const permission = await requestNotificationPermission();
    setNotificationPermission(permission);
    const now = new Date().toISOString();
    const selectedRoute = routeOptions[selectedRouteIndex];
    if (!selectedRoute) {
      return;
    }
    const journey = {
      from: fromStation,
      to: toStation,
      startTime: now,
      path: selectedRoute.path,
      plannedDistanceKm: selectedRoute.distanceKm,
      plannedStops: selectedRoute.stopsCount,
      plannedSegments: selectedRoute.segments,
      plannedTransfers: selectedRoute.transfers
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
              routeOptions={routeOptions}
              selectedRouteIndex={selectedRouteIndex}
              onSelectRoute={setSelectedRouteIndex}
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
