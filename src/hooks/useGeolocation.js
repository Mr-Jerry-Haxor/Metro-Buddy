import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 1000,
  timeout: 10000
};

export function useGeolocation(enable = false, options = DEFAULT_OPTIONS) {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const [isWatching, setIsWatching] = useState(false);
  const workerRef = useRef(null);
  const watchIdRef = useRef(null);

  useEffect(() => {
    if (!enable) {
      stopWatching();
      return undefined;
    }

    try {
      workerRef.current = new Worker(new URL('../workers/locationWorker.js', import.meta.url), {
        type: 'module'
      });

      workerRef.current.onmessage = ({ data }) => {
        if (data.status === 'success') {
          setPosition(data.position);
          setError(null);
        } else if (data.status === 'error') {
          setError(data.error);
        }
      };

      workerRef.current.postMessage({ type: 'start', payload: { options } });
      setIsWatching(true);
      return () => {
        workerRef.current?.postMessage({ type: 'stop' });
        workerRef.current?.terminate();
        workerRef.current = null;
        setIsWatching(false);
      };
    } catch (workerError) {
      console.warn('Falling back to window geolocation watcher', workerError);
      startFallbackWatcher();
      return () => stopFallbackWatcher();
    }
    // eslint-disable-next-line
  }, [enable, options?.enableHighAccuracy, options?.maximumAge, options?.timeout]);

  const startFallbackWatcher = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setError({ message: 'Geolocation is not supported.' });
      return;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (nextPosition) => {
        setPosition(nextPosition);
        setError(null);
      },
      (nextError) => setError(nextError),
      options
    );
    setIsWatching(true);
  }, [options]);

  const stopFallbackWatcher = useCallback(() => {
    if (watchIdRef.current !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsWatching(false);
  }, []);

  const stopWatching = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'stop' });
      workerRef.current.terminate();
      workerRef.current = null;
    }
    stopFallbackWatcher();
  }, [stopFallbackWatcher]);

  return {
    position,
    error,
    isWatching,
    stopWatching
  };
}
