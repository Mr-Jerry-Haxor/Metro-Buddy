let watchId = null;

function postStatus(status, data) {
  self.postMessage({ status, ...data });
}

self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};

  if (type === 'start') {
    if (!self.navigator?.geolocation) {
      postStatus('error', {
        error: { code: 0, message: 'Geolocation is not supported in this context.' }
      });
      return;
    }

    if (watchId) {
      self.navigator.geolocation.clearWatch(watchId);
    }

    watchId = self.navigator.geolocation.watchPosition(
      (position) => {
        postStatus('success', { position });
      },
      (error) => {
        postStatus('error', { error });
      },
      payload?.options || {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000
      }
    );
  }

  if (type === 'stop' && watchId !== null) {
    self.navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
});
