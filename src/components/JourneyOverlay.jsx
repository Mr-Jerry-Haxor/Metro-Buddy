import { useEffect, useMemo, useRef, useState } from 'react';

const WIDTH = 640;
const HEIGHT = 360;

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function fitText(context, value, maxWidth, startingSize, weight = 700) {
  let size = startingSize;
  do {
    context.font = `${weight} ${size}px Inter, system-ui, sans-serif`;
    if (context.measureText(value).width <= maxWidth) {
      return size;
    }
    size -= 1;
  } while (size > 18);
  return size;
}

function JourneyOverlay({
  currentStation,
  nextStation,
  destinationStation,
  lineLabel,
  remainingStops,
  etaMinutes,
  progress
}) {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [isSupported, setIsSupported] = useState(false);
  const [isFloating, setIsFloating] = useState(false);
  const [message, setMessage] = useState('');

  const overlayData = useMemo(
    () => ({
      current: currentStation?.stop_name || 'Locating train…',
      next: nextStation?.stop_name || destinationStation?.stop_name || 'Destination',
      destination: destinationStation?.stop_name || 'Destination',
      line: lineLabel || 'Hyderabad Metro',
      stops: Number.isFinite(remainingStops) ? remainingStops : '—',
      eta: etaMinutes ? `${etaMinutes} min` : 'Calculating',
      progress: Math.min(Math.max(progress || 0, 0), 1)
    }),
    [currentStation, destinationStation, etaMinutes, lineLabel, nextStation, progress, remainingStops]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const supported = Boolean(
      canvas?.captureStream &&
        video?.requestPictureInPicture &&
        document.pictureInPictureEnabled
    );
    setIsSupported(supported);

    if (!supported) {
      return undefined;
    }

    const stream = canvas.captureStream(12);
    streamRef.current = stream;
    video.srcObject = stream;
    video.play().catch(() => {});

    const onEnter = () => {
      setIsFloating(true);
      setMessage('Overlay is live. You can switch apps now.');
    };
    const onLeave = () => {
      setIsFloating(false);
      setMessage('Overlay closed. Live notification updates remain active.');
    };
    video.addEventListener('enterpictureinpicture', onEnter);
    video.addEventListener('leavepictureinpicture', onLeave);

    return () => {
      video.removeEventListener('enterpictureinpicture', onEnter);
      video.removeEventListener('leavepictureinpicture', onLeave);
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      video.srcObject = null;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!context) {
      return undefined;
    }

    let frame = 0;
    let animationId;

    function paint() {
      frame += 1;
      const pulse = (Math.sin(frame / 9) + 1) / 2;
      const gradient = context.createLinearGradient(0, 0, WIDTH, HEIGHT);
      gradient.addColorStop(0, '#071a2d');
      gradient.addColorStop(0.55, '#0b2840');
      gradient.addColorStop(1, '#113f59');
      context.fillStyle = gradient;
      context.fillRect(0, 0, WIDTH, HEIGHT);

      context.fillStyle = 'rgba(255,255,255,0.06)';
      roundedRect(context, 24, 22, 592, 316, 30);
      context.fill();

      context.fillStyle = '#72e3ad';
      context.beginPath();
      context.arc(54, 56, 7 + pulse * 2, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#b8cad6';
      context.font = '700 18px Inter, system-ui, sans-serif';
      context.fillText('LIVE JOURNEY', 76, 63);
      context.fillStyle = '#ffffff';
      context.textAlign = 'right';
      context.fillText(overlayData.line.toUpperCase(), 586, 63);
      context.textAlign = 'left';

      context.fillStyle = '#8ea7b7';
      context.font = '700 15px Inter, system-ui, sans-serif';
      context.fillText('CURRENT STATION', 48, 108);
      context.fillStyle = '#ffffff';
      fitText(context, overlayData.current, 540, 38, 800);
      context.fillText(overlayData.current, 48, 151);

      context.fillStyle = '#8ea7b7';
      context.font = '700 15px Inter, system-ui, sans-serif';
      context.fillText('NEXT', 48, 194);
      context.fillStyle = '#ffd45e';
      fitText(context, overlayData.next, 350, 28, 800);
      context.fillText(overlayData.next, 48, 226);

      context.fillStyle = '#8ea7b7';
      context.font = '700 14px Inter, system-ui, sans-serif';
      context.fillText('STOPS LEFT', 468, 188);
      context.fillStyle = '#ffffff';
      context.font = '800 30px Inter, system-ui, sans-serif';
      context.fillText(String(overlayData.stops), 468, 224);

      context.fillStyle = 'rgba(255,255,255,0.14)';
      roundedRect(context, 48, 264, 544, 10, 5);
      context.fill();
      const visibleProgress = Math.max(overlayData.progress, 0.025);
      const progressGradient = context.createLinearGradient(48, 0, 592, 0);
      progressGradient.addColorStop(0, '#72e3ad');
      progressGradient.addColorStop(1, '#ffd45e');
      context.fillStyle = progressGradient;
      roundedRect(context, 48, 264, 544 * visibleProgress, 10, 5);
      context.fill();
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.arc(48 + 544 * visibleProgress, 269, 9 + pulse * 2, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = '#8ea7b7';
      context.font = '600 15px Inter, system-ui, sans-serif';
      context.fillText(`To ${overlayData.destination}`, 48, 309);
      context.textAlign = 'right';
      context.fillStyle = '#ffffff';
      context.fillText(`ETA ${overlayData.eta}`, 592, 309);
      context.textAlign = 'left';

      animationId = window.requestAnimationFrame(paint);
    }

    paint();
    return () => window.cancelAnimationFrame(animationId);
  }, [overlayData]);

  async function toggleOverlay() {
    const video = videoRef.current;
    if (!isSupported || !video) {
      setMessage('Your browser cannot float this card. The ongoing notification will show station updates instead.');
      return;
    }
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        if (video.paused) {
          video.play().catch(() => {});
        }
        await video.requestPictureInPicture();
      }
    } catch (error) {
      console.warn('Could not open journey overlay', error);
      setMessage('Could not open the overlay. Keep this tab open and use the live notification instead.');
    }
  }

  return (
    <section className="overlay-control" aria-labelledby="overlay-title">
      <canvas ref={canvasRef} className="overlay-canvas" width={WIDTH} height={HEIGHT} aria-hidden="true" />
      <video ref={videoRef} className="overlay-video" muted playsInline aria-hidden="true" />
      <div className="overlay-icon" aria-hidden="true">
        <span />
      </div>
      <div className="overlay-copy">
        <p className="eyebrow">Ride overlay</p>
        <h3 id="overlay-title">Keep the next station above other apps</h3>
        <p>
          {isSupported
            ? 'Open the floating journey card, then switch apps. Station and ETA details keep updating.'
            : 'Floating video is unavailable here. Metro Buddy will keep an ongoing station notification updated.'}
        </p>
        {message && <p className="overlay-message" role="status">{message}</p>}
      </div>
      <button type="button" className={`overlay-button ${isFloating ? 'is-active' : ''}`} onClick={toggleOverlay}>
        {isFloating ? 'Close overlay' : isSupported ? 'Float over apps' : 'Show fallback'}
      </button>
    </section>
  );
}

export default JourneyOverlay;
