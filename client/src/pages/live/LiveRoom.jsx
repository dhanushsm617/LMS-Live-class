import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { io } from 'socket.io-client';
import { LiveKitRoom, VideoConference, RoomAudioRenderer } from '@livekit/components-react';
import '@livekit/components-styles';
import { errMsg, useEndLiveMutation, useGetLiveQuery, useLiveTokenMutation, useStartLiveMutation } from '../../services/api.js';
import { selectUser } from '../../features/auth/authSlice.js';
import LiveChat from '../../components/LiveChat.jsx';
import { ErrorBox, Spinner, StatusBadge } from '../../components/ui.jsx';
import { formatDateTime } from '../../utils/format.js';

/**
 * WebRTC media (camera / mic / screen share) is handled by LiveKit, an open-source SFU, so a class
 * scales beyond the handful of peers a pure mesh could handle. Chat is separate (Socket.IO) so it
 * keeps working – and is persisted – even if a learner's media connection drops.
 */
export default function LiveRoom() {
  const { id } = useParams();
  const user = useSelector(selectUser);
  const { data, isLoading, error } = useGetLiveQuery(id, { pollingInterval: 5000 });
  const [getToken] = useLiveTokenMutation();
  const [startLive, { isLoading: starting }] = useStartLiveMutation();
  const [endLive] = useEndLiveMutation();
  const [media, setMedia] = useState(null); // { token, serverUrl }
  const [socket, setSocket] = useState(null);
  const [online, setOnline] = useState(0);
  const [joinError, setJoinError] = useState(null);

  const live = data?.liveClass;
  const isHost = data?.isHost;
  const status = live?.status;

  // Chat socket lives as long as the page does
  useEffect(() => {
    const s = io({ withCredentials: true });
    s.on('connect', () => s.emit('chat:join', { liveClassId: id }, (res) => !res?.ok && setJoinError(res?.error)));
    s.on('chat:presence', ({ count }) => setOnline(count));
    s.on('live:ended', () => setMedia(null));
    setSocket(s);
    return () => s.disconnect();
  }, [id]);

  const join = async () => {
    setJoinError(null);
    try {
      setMedia(await getToken(id).unwrap());
    } catch (e) {
      setJoinError(errMsg(e));
    }
  };

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;

  return (
    <>
      <div className="row between wrap">
        <div>
          <Link to="/live" className="small">← Live classes</Link>
          <h1 className="h-sm">{live.title} <StatusBadge status={status} /></h1>
          <div className="small muted">{live.course?.title} · {formatDateTime(live.scheduledAt)} · {online} online</div>
        </div>
        {isHost && status === 'scheduled' && <button className="btn btn-primary" disabled={starting} onClick={() => startLive(id).unwrap().then(join)}>Start class</button>}
        {isHost && status === 'live' && <button className="btn btn-ghost danger" onClick={() => endLive(id).unwrap().then(() => setMedia(null))}>End class for everyone</button>}
      </div>

      <ErrorBox>{joinError}</ErrorBox>

      <div className="live-grid">
        <section className="card stage">
          {media ? (
            <LiveKitRoom
              data-lk-theme="default"
              token={media.token}
              serverUrl={media.serverUrl}
              connect
              video={isHost}
              audio={isHost}
              onDisconnected={() => setMedia(null)}
              onError={(e) => setJoinError(e.message)}
              style={{ height: '100%' }}
            >
              <VideoConference />
              <RoomAudioRenderer />
            </LiveKitRoom>
          ) : (
            <div className="center stack">
              {status === 'ended' && <p className="muted">This class has ended.</p>}
              {status === 'scheduled' && !isHost && <p className="muted">The instructor hasn’t started the class yet. This page updates automatically – you can chat in the meantime.</p>}
              {(status === 'live' || (isHost && status === 'scheduled')) && status === 'live' && (
                <button className="btn btn-primary" onClick={join}>{isHost ? 'Rejoin as host' : 'Join class'}</button>
              )}
            </div>
          )}
        </section>
        <aside className="card pad chat-panel">
          <h3 className="h-sm">Class chat</h3>
          <LiveChat liveClassId={id} socket={socket} selfId={String(user.id)} />
        </aside>
      </div>
    </>
  );
}
