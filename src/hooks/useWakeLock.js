import { useEffect, useRef, useState } from 'react';

export function useWakeLock(shouldLock) {
  const wakeLockRef = useRef(null);
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function requestLock() {
      if (!('wakeLock' in navigator) || wakeLockRef.current) {
        return;
      }
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        if (!isMounted) {
          return;
        }
        setIsLocked(true);
        wakeLockRef.current.addEventListener('release', () => {
          if (isMounted) {
            setIsLocked(false);
          }
        });
      } catch (error) {
        console.warn('Wake lock request failed', error);
      }
    }

    if (shouldLock) {
      requestLock();
    } else if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
      setIsLocked(false);
    }

    return () => {
      isMounted = false;
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    };
  }, [shouldLock]);

  return isLocked;
}
