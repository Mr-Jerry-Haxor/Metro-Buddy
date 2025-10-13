let alarmContext;
let alarmNode;

export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  return Notification.requestPermission();
}

export async function showPersistentNotification(title, options = {}) {
  if (!('serviceWorker' in navigator)) {
    return;
  }
  const registration = await navigator.serviceWorker.ready;
  try {
    await registration.showNotification(title, {
      tag: 'metro-tracker',
      renotify: true,
      silent: false,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      ...options
    });
  } catch (error) {
    console.warn('Persistent notification failed', error);
  }
}

export async function updatePersistentNotification(fields) {
  if (!('serviceWorker' in navigator)) {
    return;
  }
  const registration = await navigator.serviceWorker.ready;
  try {
    const notifications = await registration.getNotifications({ tag: 'metro-tracker' });
    if (!notifications.length) {
      return showPersistentNotification(fields.title || 'Metro Tracker', fields);
    }
    notifications.forEach((notification) => {
      notification.close();
    });
    return showPersistentNotification(fields.title || 'Metro Tracker', fields);
  } catch (error) {
    console.warn('Notification update failed', error);
  }
}

export function triggerVibration(pattern = [200, 100, 200]) {
  if ('vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
}

export function playAlarm(soundType = 'sine', durationMs = 4000) {
  if (!window.AudioContext && !window.webkitAudioContext) {
    return () => {};
  }
  const Context = window.AudioContext || window.webkitAudioContext;
  alarmContext = alarmContext || new Context();
  alarmNode = alarmContext.createOscillator();
  const gainNode = alarmContext.createGain();
  alarmNode.type = soundType === 'chime' ? 'triangle' : 'sine';
  const baseFrequency = soundType === 'chime' ? 660 : 880;
  alarmNode.frequency.setValueAtTime(baseFrequency, alarmContext.currentTime);
  gainNode.gain.setValueAtTime(0.001, alarmContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.3, alarmContext.currentTime + 0.05);
  gainNode.gain.exponentialRampToValueAtTime(0.001, alarmContext.currentTime + durationMs / 1000);
  alarmNode.connect(gainNode);
  gainNode.connect(alarmContext.destination);
  alarmNode.start();
  alarmNode.stop(alarmContext.currentTime + durationMs / 1000);
  return stopAlarm;
}

export function stopAlarm() {
  try {
    alarmNode?.stop();
    alarmNode?.disconnect();
  } catch (error) {
    console.warn('Failed to stop alarm', error);
  }
}
