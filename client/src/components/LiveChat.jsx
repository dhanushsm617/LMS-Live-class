import { useEffect, useRef, useState } from 'react';
import { useLiveMessagesQuery } from '../services/api.js';

/**
 * Persistent live chat over Socket.IO. History comes from REST (so late joiners see context);
 * new messages arrive as 'chat:message' events on the shared socket.
 */
export default function LiveChat({ liveClassId, socket, selfId }) {
  const { data } = useLiveMessagesQuery(liveClassId);
  const [live, setLive] = useState([]);
  const [text, setText] = useState('');
  const [err, setErr] = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    if (!socket) return undefined;
    const onMsg = (m) => setLive((prev) => [...prev, m]);
    socket.on('chat:message', onMsg);
    return () => socket.off('chat:message', onMsg);
  }, [socket]);

  const history = data?.items || [];
  const seen = new Set(history.map((m) => m.id));
  const messages = [...history, ...live.filter((m) => !seen.has(m.id))];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const send = (e) => {
    e.preventDefault();
    const clean = text.trim();
    if (!clean || !socket) return;
    socket.emit('chat:message', { text: clean }, (res) => {
      if (!res?.ok) setErr(res?.error || 'Could not send');
      else setErr(null);
    });
    setText('');
  };

  return (
    <div className="chat">
      <div className="chat-log" role="log" aria-live="polite">
        {messages.length === 0 && <p className="muted small center">No messages yet – say hello 👋</p>}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.userId === selfId ? 'mine' : ''}`}>
            <span className="msg-name">
              {m.userName}
              {m.role !== 'student' && <em> · {m.role}</em>}
            </span>
            <span>{m.text}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {err && <div className="small danger">{err}</div>}
      <form className="row" onSubmit={send}>
        <input className="grow" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="Type a message…" aria-label="Chat message" />
        <button className="btn btn-primary" disabled={!socket || !text.trim()}>Send</button>
      </form>
    </div>
  );
}
