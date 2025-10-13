function Settings({ preferences, onPreferenceChange }) {
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
      </form>
    </section>
  );
}

export default Settings;
