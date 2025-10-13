import { useEffect, useMemo, useState } from 'react';

function Settings({ preferences, onPreferenceChange }) {
  const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [availableVoices, setAvailableVoices] = useState([]);
  const [customPackStatus, setCustomPackStatus] = useState('');

  useEffect(() => {
    if (!speechSupported) {
      return;
    }
    function syncVoices() {
      const voices = window.speechSynthesis?.getVoices?.() || [];
      setAvailableVoices(voices);
    }
    syncVoices();
    const speech = window.speechSynthesis;
    speech?.addEventListener?.('voiceschanged', syncVoices);
    const previousHandler = speech?.onvoiceschanged;
    if (speech) {
      speech.onvoiceschanged = syncVoices;
    }
    return () => {
      speech?.removeEventListener?.('voiceschanged', syncVoices);
      if (speech && speech.onvoiceschanged === syncVoices) {
        speech.onvoiceschanged = previousHandler || null;
      }
    };
  }, [speechSupported]);

  const languageOptions = useMemo(() => {
    const fromVoices = availableVoices
      .map((voice) => voice.lang)
      .filter(Boolean)
      .reduce((set, lang) => set.add(lang), new Set());
    const recommended = ['te-IN', 'en-IN', 'en-GB', 'en-US'];
    const merged = new Set([...recommended, ...fromVoices]);
    return Array.from(merged).sort();
  }, [availableVoices]);

  const voicesByLanguage = useMemo(() => {
    return availableVoices.reduce((acc, voice) => {
      if (!voice?.lang) {
        return acc;
      }
      if (!acc[voice.lang]) {
        acc[voice.lang] = [];
      }
      acc[voice.lang].push(voice);
      return acc;
    }, {});
  }, [availableVoices]);

  function handleCustomVoiceUpload(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const parsed = JSON.parse(loadEvent.target?.result ?? '{}');
        if (typeof parsed !== 'object' || parsed === null) {
          throw new Error('Invalid JSON payload');
        }
        setCustomPackStatus('Custom voice pack applied.');
        onPreferenceChange('voiceCustomPack', parsed);
      } catch (error) {
        console.error('Failed to parse custom voice pack', error);
        setCustomPackStatus('Could not read custom voice pack. Please verify JSON format.');
      }
    };
    reader.readAsText(file);
  }

  function clearCustomPack() {
    onPreferenceChange('voiceCustomPack', null);
    setCustomPackStatus('Custom voice pack removed.');
  }

  return (
    <section className="card">
      <h2>Preferences</h2>
      <form className="settings-form" onSubmit={(event) => event.preventDefault()}>
        <div className="form-field">
          <label htmlFor="alarm-distance">Alarm distance (meters)</label>
          <input
            id="alarm-distance"
            type="number"
            min="100"
            step="50"
            value={preferences.alarmDistanceMeters}
            onChange={(event) => onPreferenceChange('alarmDistanceMeters', Number(event.target.value))}
          />
          <p className="hint">Choose how early you want the app to warn you before arrival.</p>
        </div>

        <div className="form-field">
          <label htmlFor="notification-sound">Notification sound</label>
          <select
            id="notification-sound"
            value={preferences.notificationSound}
            onChange={(event) => onPreferenceChange('notificationSound', event.target.value)}
          >
            <option value="sine">Bright tone</option>
            <option value="chime">Soft chime</option>
            <option value="mute">Mute</option>
          </select>
          <p className="hint">Pick the alert tone that suits your commute vibe.</p>
        </div>

        <div className="form-field">
          <label htmlFor="theme-select">Theme</label>
          <select
            id="theme-select"
            value={preferences.theme}
            onChange={(event) => onPreferenceChange('theme', event.target.value)}
          >
            <option value="system">System default</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
          <p className="hint">Switch between light, dark, or follow your device automatically.</p>
        </div>

        <div className="form-field">
          <label htmlFor="voice-announcements">Voice announcements</label>
          <label className="toggle-field">
            <input
              id="voice-announcements"
              type="checkbox"
              checked={Boolean(preferences.voiceAnnouncements)}
              onChange={(event) => onPreferenceChange('voiceAnnouncements', event.target.checked)}
            />
            <span>Enable bilingual station alerts</span>
          </label>
          {!speechSupported && (
            <p className="status-banner warning">
              Voice synthesis is not supported in this browser. Try Chrome, Edge, or Safari.
            </p>
          )}
          <p className="hint">We will announce approaching stops in Telugu followed by English.</p>
        </div>

        {speechSupported && preferences.voiceAnnouncements && (
          <>
            <div className="form-field">
              <label htmlFor="primary-language">Primary language</label>
              <select
                id="primary-language"
                value={preferences.voicePrimaryLang}
                onChange={(event) => onPreferenceChange('voicePrimaryLang', event.target.value)}
              >
                {languageOptions.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
              <p className="hint">Choose the language/accent used for the first announcement.</p>
            </div>

            <div className="form-field">
              <label htmlFor="primary-voice">Primary voice / accent</label>
              <select
                id="primary-voice"
                value={preferences.voicePrimaryVoice || ''}
                onChange={(event) => onPreferenceChange('voicePrimaryVoice', event.target.value)}
              >
                <option value="">System default</option>
                {(voicesByLanguage[preferences.voicePrimaryLang] || []).map((voice) => (
                  <option key={voice.voiceURI} value={voice.voiceURI}>
                    {voice.name} ({voice.lang})
                  </option>
                ))}
              </select>
              <p className="hint">Voice options depend on your operating system.</p>
            </div>

            <div className="form-field">
              <label htmlFor="secondary-language">Secondary language</label>
              <select
                id="secondary-language"
                value={preferences.voiceSecondaryLang || ''}
                onChange={(event) => onPreferenceChange('voiceSecondaryLang', event.target.value)}
              >
                <option value="">None</option>
                {languageOptions.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
              <p className="hint">Optional second announcement (default: English).</p>
            </div>

            {preferences.voiceSecondaryLang && (
              <div className="form-field">
                <label htmlFor="secondary-voice">Secondary voice / accent</label>
                <select
                  id="secondary-voice"
                  value={preferences.voiceSecondaryVoice || ''}
                  onChange={(event) => onPreferenceChange('voiceSecondaryVoice', event.target.value)}
                >
                  <option value="">System default</option>
                  {(voicesByLanguage[preferences.voiceSecondaryLang] || []).map((voice) => (
                    <option key={voice.voiceURI} value={voice.voiceURI}>
                      {voice.name} ({voice.lang})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="inline-inputs">
              <div className="form-field">
                <label htmlFor="voice-rate">Voice rate</label>
                <input
                  id="voice-rate"
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={preferences.voiceRate ?? 1}
                  onChange={(event) => onPreferenceChange('voiceRate', Number(event.target.value))}
                />
                <p className="hint">Speaking speed (1.0 = normal).</p>
              </div>
              <div className="form-field">
                <label htmlFor="voice-pitch">Voice pitch</label>
                <input
                  id="voice-pitch"
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={preferences.voicePitch ?? 1}
                  onChange={(event) => onPreferenceChange('voicePitch', Number(event.target.value))}
                />
                <p className="hint">Adjust tone depth (1.0 = neutral).</p>
              </div>
              <div className="form-field">
                <label htmlFor="voice-volume">Voice volume</label>
                <input
                  id="voice-volume"
                  type="range"
                  min="0.2"
                  max="1"
                  step="0.05"
                  value={preferences.voiceVolume ?? 1}
                  onChange={(event) => onPreferenceChange('voiceVolume', Number(event.target.value))}
                />
                <p className="hint">Keep it comfortable relative to your media volume.</p>
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="voice-pack">Custom voice pack (JSON)</label>
              <input id="voice-pack" type="file" accept="application/json" onChange={handleCustomVoiceUpload} />
              <p className="hint">
                Upload advanced TTS settings. Example:{' '}
                <code>{'{"primary":{"lang":"te-IN","voiceURI":"","rate":1},"secondary":{"lang":"en-IN"}}'}</code>
              </p>
              {customPackStatus && <p className="status-banner info">{customPackStatus}</p>}
              {preferences.voiceCustomPack && (
                <div className="custom-pack-preview">
                  <pre>{JSON.stringify(preferences.voiceCustomPack, null, 2)}</pre>
                  <button type="button" className="link-button" onClick={clearCustomPack}>
                    Remove custom pack
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </form>
    </section>
  );
}

export default Settings;
