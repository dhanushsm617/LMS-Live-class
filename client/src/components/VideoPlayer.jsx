import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { errMsg, useGetPlaybackQuery } from '../services/api.js';
import { ErrorBox, Spinner } from './ui.jsx';

/**
 * Adaptive HLS player. The playback endpoint sets the auth cookies (CloudFront signed cookies in
 * production), so every playlist/segment request must be sent with credentials.
 */
export default function VideoPlayer({ lessonId, startAt = 0, onProgress, onEnded }) {
  const { data, error, isLoading } = useGetPlaybackQuery(lessonId);
  const ref = useRef(null);
  const lastSent = useRef(0);
  const [fatal, setFatal] = useState(null);

  useEffect(() => {
    const video = ref.current;
    if (!video || !data?.url) return undefined;
    setFatal(null);
    lastSent.current = startAt;
    let hls;

    const resume = () => {
      if (startAt > 3 && (!video.duration || startAt < video.duration - 5)) video.currentTime = startAt;
    };

    if (Hls.isSupported()) {
      hls = new Hls({ xhrSetup: (xhr) => (xhr.withCredentials = true) });
      hls.loadSource(data.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, resume);
      hls.on(Hls.Events.ERROR, (_e, d) => {
        if (!d.fatal) return;
        if (d.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else setFatal('The video could not be played. Try reloading the page.');
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = data.url; // Safari plays HLS natively
      video.addEventListener('loadedmetadata', resume, { once: true });
    } else {
      setFatal('Your browser does not support HLS video playback.');
    }
    return () => hls?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.url, lessonId]);

  const report = (force = false) => {
    const v = ref.current;
    if (!v || !onProgress) return;
    if (force || Math.abs(v.currentTime - lastSent.current) >= 10) {
      lastSent.current = v.currentTime;
      onProgress(v.currentTime, v.duration);
    }
  };

  if (isLoading) return <Spinner label="Preparing video…" />;
  if (error) return <ErrorBox>{error.status === 409 ? 'This lesson’s video is still being processed. Check back in a few minutes.' : errMsg(error)}</ErrorBox>;

  return (
    <div className="player">
      <video
        ref={ref}
        controls
        playsInline
        poster={data?.poster || undefined}
        onTimeUpdate={() => report()}
        onPause={() => report(true)}
        onEnded={() => {
          report(true);
          onEnded?.();
        }}
      />
      {fatal && <ErrorBox>{fatal}</ErrorBox>}
    </div>
  );
}
