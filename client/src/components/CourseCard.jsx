import { Link } from 'react-router-dom';
import { formatDuration, formatMoney } from '../utils/format.js';
import { ProgressBar } from './ui.jsx';

const ART = {
  'Web Development': { from: '#172554', to: '#4338ca', accent: '#67e8f9', kind: 'code' },
  'Computer Science': { from: '#082f49', to: '#0f766e', accent: '#a3e635', kind: 'nodes' },
  Design: { from: '#701a75', to: '#c2415d', accent: '#fef08a', kind: 'design' },
  DevOps: { from: '#312e81', to: '#0369a1', accent: '#5eead4', kind: 'cloud' },
};

export function Thumb({ course }) {
  const art = ART[course.category] || ART['Web Development'];
  return (
    <div className="thumb" role="img" aria-label={`${course.category}: ${course.title}`}>
      {course.thumbnail ? (
        <img className="thumb-image" src={course.thumbnail} alt="" loading="lazy" />
      ) : (
        <svg className="thumb-art" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <linearGradient id={`cover-${art.kind}`} x1="0" y1="0" x2="1" y2="1">
              <stop stopColor={art.from} /><stop offset="1" stopColor={art.to} />
            </linearGradient>
            <pattern id={`grid-${art.kind}`} width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M32 0H0V32" fill="none" stroke="white" strokeOpacity=".08" />
            </pattern>
          </defs>
          <rect width="640" height="360" fill={`url(#cover-${art.kind})`} />
          <rect width="640" height="360" fill={`url(#grid-${art.kind})`} />
          <circle cx="540" cy="48" r="142" fill={art.accent} opacity=".12" />
          {art.kind === 'code' && <g transform="translate(344 66) rotate(-5 120 110)">
            <rect width="230" height="190" rx="18" fill="#0f172a" stroke="white" strokeOpacity=".36" strokeWidth="3" />
            <circle cx="22" cy="22" r="5" fill="#fb7185" /><circle cx="42" cy="22" r="5" fill="#fbbf24" /><circle cx="62" cy="22" r="5" fill="#4ade80" />
            <path d="M30 64h95M30 88h148M30 112h72M30 136h126M30 160h84" stroke={art.accent} strokeWidth="8" strokeLinecap="round" opacity=".8" />
            <path d="M-28 202h286l-25 20H-4z" fill="#c7d2fe" />
          </g>}
          {art.kind === 'nodes' && <g fill="none" stroke={art.accent} strokeWidth="5" opacity=".9">
            <path d="M455 95 365 155 490 205 390 270M455 95l100 54-65 56 98 74" />
            <g fill="#0f766e" stroke={art.accent}><circle cx="455" cy="95" r="19"/><circle cx="365" cy="155" r="16"/><circle cx="555" cy="149" r="16"/><circle cx="490" cy="205" r="20"/><circle cx="390" cy="270" r="16"/><circle cx="523" cy="285" r="16"/></g>
          </g>}
          {art.kind === 'design' && <g transform="translate(390 62) rotate(12 100 110)">
            <rect x="10" y="14" width="192" height="210" rx="28" fill="#fff7ed" opacity=".94" />
            <circle cx="106" cy="112" r="62" fill="#f472b6"/><path d="M106 50a62 62 0 0 1 62 62h-62z" fill="#fb923c"/><path d="M168 112a62 62 0 0 1-62 62v-62z" fill="#a3e635"/>
            <circle cx="106" cy="112" r="23" fill="#fff7ed"/><path d="M42 206h128" stroke="#a78bfa" strokeWidth="9" strokeLinecap="round" />
          </g>}
          {art.kind === 'cloud' && <g transform="translate(350 85)">
            <path d="M70 154a48 48 0 0 1-3-96 69 69 0 0 1 131 15 42 42 0 0 1-7 83z" fill="#e0f2fe" opacity=".94" />
            <g fill="#0f172a" stroke={art.accent} strokeWidth="4"><rect x="80" y="86" width="72" height="20" rx="6"/><rect x="80" y="114" width="72" height="20" rx="6"/></g>
            <g fill={art.accent}><circle cx="94" cy="96" r="3"/><circle cx="94" cy="124" r="3"/></g>
            <path d="M116 96h25M116 124h25" stroke="white" strokeWidth="4" strokeLinecap="round" />
          </g>}
          <path d="M0 280c110-40 190 35 300 0s200-30 340 8v72H0z" fill="#020617" opacity=".22" />
          <text x="30" y="315" fill="white" fontSize="21" fontFamily="system-ui, sans-serif" fontWeight="700" letterSpacing="2" opacity=".92">{course.category?.toUpperCase()}</text>
        </svg>
      )}
    </div>
  );
}

/** `progress` (0-100) turns the card into a "continue learning" card. */
export default function CourseCard({ course, to, progress }) {
  return (
    <Link to={to || `/courses/${course.slug}`} className="card course-card">
      <Thumb course={course} />
      <div className="card-body">
        <div className="small muted">{course.category} · {course.level}</div>
        <h3>{course.title}</h3>
        <p className="muted small clamp">{course.subtitle}</p>
        <div className="small muted">
          {course.instructor?.name} · {course.lessonCount} lessons{course.durationSec ? ` · ${formatDuration(course.durationSec)}` : ''}
        </div>
        {progress !== undefined ? (
          <div className="mt">
            <ProgressBar value={progress} label={`${course.title} progress`} />
            <div className="small muted">{progress}% complete</div>
          </div>
        ) : (
          <div className="price">{course.price === 0 ? 'Free' : formatMoney(course.price, course.currency)}</div>
        )}
      </div>
    </Link>
  );
}
