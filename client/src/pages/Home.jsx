import { useState } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { useGetCoursesQuery } from '../services/api.js';
import { selectUser } from '../features/auth/authSlice.js';
import CourseCard from '../components/CourseCard.jsx';
import { Empty, ErrorBox, Spinner } from '../components/ui.jsx';

export default function Home() {
  const user = useSelector(selectUser);
  const [filters, setFilters] = useState({ q: '', category: '', level: '', sort: 'popular', page: 1 });
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));
  const { data, isFetching, error } = useGetCoursesQuery(params);
  const set = (patch) => setFilters((f) => ({ ...f, page: 1, ...patch }));

  return (
    <>
      {!user && (
        <section className="hero">
          <h1>Learn job-ready skills from working engineers and designers.</h1>
          <p>Video lessons, auto-graded quizzes, live classes and certificates employers can verify.</p>
          <div className="row">
            <Link to="/register" className="btn btn-primary">Start learning free</Link>
            <Link to="/register?role=instructor" className="btn btn-light">Teach on LearnHub</Link>
          </div>
        </section>
      )}

      <div className="row between wrap">
        <h2>Explore courses</h2>
        <div className="row wrap">
          <input type="search" placeholder="Search courses…" aria-label="Search courses" value={filters.q} onChange={(e) => set({ q: e.target.value })} />
          <select aria-label="Category" value={filters.category} onChange={(e) => set({ category: e.target.value })}>
            <option value="">All categories</option>
            {data?.categories?.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select aria-label="Level" value={filters.level} onChange={(e) => set({ level: e.target.value })}>
            <option value="">Any level</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
          <select aria-label="Sort" value={filters.sort} onChange={(e) => set({ sort: e.target.value })}>
            <option value="popular">Most popular</option>
            <option value="newest">Newest</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
          </select>
        </div>
      </div>

      <ErrorBox error={error} />
      {isFetching && !data && <Spinner />}
      {data && data.items.length === 0 && <Empty title="No courses match your filters">Try a different search term or clear a filter.</Empty>}
      <div className="grid-cards" style={{ opacity: isFetching ? 0.6 : 1 }}>
        {data?.items.map((c) => <CourseCard key={c.id} course={c} />)}
      </div>

      {data?.pages > 1 && (
        <div className="row center-row">
          <button className="btn" disabled={filters.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>← Previous</button>
          <span className="muted small">Page {data.page} of {data.pages}</span>
          <button className="btn" disabled={filters.page >= data.pages} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>Next →</button>
        </div>
      )}
    </>
  );
}
