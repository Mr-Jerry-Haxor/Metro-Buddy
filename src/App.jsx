import { useEffect, useMemo, useState } from 'react';
import StationSelector from './components/StationSelector';
import Tracker from './components/Tracker';
import TripHistory from './components/TripHistory';
import Settings from './components/Settings';
import TrainBoard from './components/TrainBoard';
import {
  addTrip,
  bulkUpsertStations,
  getStations,
  getPreference,
  savePreference,
  saveActiveJourney,
  getActiveJourney,
  clearActiveJourney
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
  TRAINS: 'trains',
  SETTINGS: 'settings'
};

function App() {
  const [stations, setStations] = useState([]);
  const [fromStation, setFromStation] = useState('');
  const [toStation, setToStation] = useState('');
  const [lines, setLines] = useState([]);
  const [schedule, setSchedule] = useState(null);
  const [scheduleError, setScheduleError] = useState('');
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
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [installPrompt, setInstallPrompt] = useState(null);

  useEffect(() => {
    async function hydrateStations() {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}assets/hyderabad_metro_stations.json`);
        const data = await response.json();
        setStations(data);
        setIsLoading(false);
        await bulkUpsertStations(data);
        const lineResponse = await fetch(`${import.meta.env.BASE_URL}assets/metro_lines.json`);
        const lineData = await lineResponse.json();
        setLines(lineData);
        try {
          const scheduleResponse = await fetch(`${import.meta.env.BASE_URL}assets/metro_schedule.json`);
          if (!scheduleResponse.ok) {
            throw new Error(`Schedule request failed with ${scheduleResponse.status}`);
          }
          setSchedule(await scheduleResponse.json());
        } catch (timetableError) {
          console.warn('Official timetable could not be loaded', timetableError);
          setScheduleError('The official timetable is unavailable. Route planning and rider GPS tracking still work.');
          setLoadError('Routes are ready, but the official train timetable is temporarily unavailable.');
        }
        const savedJourney = await getActiveJourney();
        if (savedJourney) {
          setJourneyState(savedJourney);
          setFromStation(savedJourney.from || '');
          setToStation(savedJourney.to || '');
          if (savedJourney.selectedRouteIndex != null) {
            setSelectedRouteIndex(savedJourney.selectedRouteIndex);
          }
        }
      } catch (error) {
        console.error('Failed to hydrate station list', error);
        const cachedStations = await getStations().catch(() => []);
        if (cachedStations.length) {
          setStations(cachedStations);
          setLoadError('Route maps are offline. Saved stations are still available.');
        } else {
          setLoadError('Metro data could not be loaded. Check your connection and try again.');
        }
      } finally {
        setIsLoading(false);
      }
    }
    hydrateStations();
  }, []);

  useEffect(() => {
    function captureInstallPrompt(event) {
      event.preventDefault();
      setInstallPrompt(event);
    }
    function clearInstallPrompt() {
      setInstallPrompt(null);
    }
    window.addEventListener('beforeinstallprompt', captureInstallPrompt);
    window.addEventListener('appinstalled', clearInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', captureInstallPrompt);
      window.removeEventListener('appinstalled', clearInstallPrompt);
    };
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
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const shouldUseDark =
        preferences.theme === 'dark' || (preferences.theme === 'system' && media.matches);
      document.documentElement.classList.toggle('dark-theme', shouldUseDark);
    };
    applyTheme();
    media.addEventListener?.('change', applyTheme);
    return () => media.removeEventListener?.('change', applyTheme);
  }, [preferences.theme]);

  async function installApp() {
    if (!installPrompt) {
      return;
    }
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

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

  const selectedFare = useMemo(() => {
    if (!fromStation || !toStation || !schedule?.fares) {
      return null;
    }
    return schedule.fares[fromStation]?.[toStation] ?? schedule.fares[toStation]?.[fromStation] ?? null;
  }, [fromStation, schedule, toStation]);

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
      plannedTransfers: selectedRoute.transfers,
      selectedRouteIndex
    };
    setJourneyState(journey);
    setActiveTab(TABS.JOURNEY);
    await saveActiveJourney(journey);
    await showPersistentNotification('Journey started', {
      body: `Journey started from ${fromStation} to ${toStation}`,
      data: { url: '/' }
    });
  }

  async function handleTripCompletion(tripMetrics) {
    const id = await addTrip(tripMetrics);
    await clearActiveJourney();
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

  async function handleCancelJourney() {
    await clearActiveJourney();
    setJourneyState(null);
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="brand-lockup">
          <img
            className="brand-mark"
            src={`${import.meta.env.BASE_URL}icons/hmr-logo.jpeg`}
            alt="Hyderabad Metro Rail"
          />
          <div>
            <p className="eyebrow">Hyderabad metro companion</p>
            <h1>Metro Buddy</h1>
          </div>
        </div>
        <div className="header-actions">
          <span className={`status-pill ${isOffline ? 'is-offline' : ''}`}>
            <span aria-hidden="true" /> <b>{isOffline ? 'Offline ready' : 'Connected'}</b>
          </span>
          {installPrompt && (
            <button type="button" className="install-button" onClick={installApp}>Install app</button>
          )}
        </div>
      </header>
      <div className="main-shell">
        <nav className="tab-bar">
          <button
            type="button"
            className={activeTab === TABS.JOURNEY ? 'active' : ''}
            onClick={() => setActiveTab(TABS.JOURNEY)}
          >
            <span aria-hidden="true">⌁</span> Journey
          </button>
          <button
            type="button"
            className={activeTab === TABS.TRAINS ? 'active' : ''}
            onClick={() => setActiveTab(TABS.TRAINS)}
          >
            <span aria-hidden="true">◉</span> Trains
          </button>
          <button
            type="button"
            className={activeTab === TABS.HISTORY ? 'active' : ''}
            onClick={() => setActiveTab(TABS.HISTORY)}
          >
            <span aria-hidden="true">↺</span> History
          </button>
          <button
            type="button"
            className={activeTab === TABS.SETTINGS ? 'active' : ''}
            onClick={() => setActiveTab(TABS.SETTINGS)}
          >
            <span aria-hidden="true">⚙</span> Settings
          </button>
        </nav>

        {activeTab === TABS.JOURNEY && (
          <main className={journeyState ? 'content content--two-column' : 'content'}>
            {loadError && <div className="status-banner warning page-banner">{loadError}</div>}
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
              isLoading={isLoading}
              fare={selectedFare}
            />
            {journeyState && (
              <Tracker
                stations={stations}
                lines={lines}
                journey={journeyState}
                preferences={preferences}
                onCancel={handleCancelJourney}
                onComplete={handleTripCompletion}
              />
            )}
          </main>
        )}

        {activeTab === TABS.HISTORY && (
          <main className="content">
            <TripHistory version={historyVersion} stations={stations} />
          </main>
        )}

        {activeTab === TABS.TRAINS && (
          <TrainBoard
            schedule={schedule}
            stations={stations}
            initialStation={fromStation}
            error={scheduleError}
          />
        )}

        {activeTab === TABS.SETTINGS && (
          <main className="content">
            <Settings preferences={preferences} onPreferenceChange={updatePreference} />
          </main>
        )}
      </div>
      <footer className="app-footer">
        <span>Metro Buddy</span>
        <span>Private by design · Independent companion, not endorsed by HMRL</span>
      </footer>
    </div>
  );
}

export default App;
