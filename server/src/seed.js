/**
 * Realistic demo data: 3 roles, 4 courses (one awaiting admin review), quizzes, ~11 months of
 * paid enrollments (drives the revenue dashboard), progress, a certificate and live classes.
 *
 *   npm run seed            (wipes the LMS collections – development only)
 *
 * All demo accounts use the password:  Password123!
 */
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { connectDb } from './config/db.js';
import User from './models/User.js';
import Course from './models/Course.js';
import Lesson from './models/Lesson.js';
import Quiz from './models/Quiz.js';
import QuizAttempt from './models/QuizAttempt.js';
import Enrollment from './models/Enrollment.js';
import Payment from './models/Payment.js';
import Certificate from './models/Certificate.js';
import LiveClass from './models/LiveClass.js';
import ChatMessage from './models/ChatMessage.js';
import { refreshCourseStats } from './services/courseStats.js';
import { recalcProgress } from './services/progress.js';

if (env.isProd) {
  console.error('Refusing to seed a production database.');
  process.exit(1);
}

// Deterministic PRNG so every run produces the same demo data
let seed = 20261029;
const rand = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const daysAgo = (d) => new Date(Date.now() - d * 86_400_000 - Math.floor(rand() * 86_400_000));

const Q = (prompt, type, options, explanation = '', points = 1) => ({
  prompt,
  type,
  points,
  explanation,
  options: options.map((o) => (Array.isArray(o) ? { text: o[0], isCorrect: true } : { text: o, isCorrect: false })),
});
const TF = (prompt, answer, explanation) =>
  Q(prompt, 'truefalse', [answer ? ['True'] : 'True', answer ? 'False' : ['False']], explanation);

const COURSES = [
  {
    key: 'mern',
    owner: 'priya',
    title: 'Full-Stack Web Development with the MERN Stack',
    subtitle: 'Build and deploy production-ready apps with MongoDB, Express, React and Node.js.',
    description:
      'A project-based course that takes you from a blank folder to a deployed full-stack application. You will design REST APIs with Express, model data with Mongoose, handle authentication with JWT and httpOnly cookies, build a React front-end with Redux Toolkit and RTK Query, process background jobs with BullMQ, and ship everything to the cloud. Weekly live sessions cover code reviews and architecture questions.',
    category: 'Web Development',
    level: 'intermediate',
    price: 149900,
    tags: ['react', 'node', 'mongodb', 'redux'],
    status: 'published',
    publishedDaysAgo: 320,
    lessons: [
      ['Foundations', 'Course roadmap and tooling', true],
      ['Foundations', 'Modern JavaScript you actually need'],
      ['Foundations', 'Node.js and the event loop'],
      ['Backend with Express and MongoDB', 'Designing REST APIs with Express'],
      ['Backend with Express and MongoDB', 'Modelling data with Mongoose'],
      ['Backend with Express and MongoDB', 'Authentication with JWT and cookies'],
      ['Backend with Express and MongoDB', 'File uploads and background jobs'],
      ['React front-end', 'React components and hooks'],
      ['React front-end', 'State management with Redux Toolkit'],
      ['React front-end', 'Data fetching with RTK Query'],
      ['Shipping it', 'Deploying to the cloud'],
      ['Shipping it', 'Monitoring and error handling'],
    ],
    quiz: {
      title: 'MERN fundamentals check',
      passPercent: 60,
      questions: [
        Q('Which HTTP method is idempotent and normally used to replace a whole resource?', 'single', ['POST', ['PUT'], 'PATCH', 'CONNECT'], 'PUT replaces the resource; repeating the same request leaves the server in the same state.'),
        Q('Which Mongoose schema option adds createdAt and updatedAt automatically?', 'single', [['{ timestamps: true }'], '{ autoDates: true }', '{ track: true }', '{ versionKey: true }'], 'Pass { timestamps: true } as the second argument to new Schema().'),
        Q('Which of these reduce the risk of an auth token being stolen via XSS?', 'multiple', [['Storing it in an httpOnly cookie'], 'Storing it in localStorage', ['Shipping a strict Content-Security-Policy'], 'Logging it to the console'], 'httpOnly cookies are invisible to JavaScript and a strict CSP limits injected scripts.', 2),
        TF('React may batch several state updates inside one event handler into a single re-render.', true, 'Since React 18 batching also applies to promises, timeouts and native handlers.'),
        Q('Redux Toolkit lets reducers "mutate" state safely because it uses…', 'single', [['Immer'], 'MobX', 'Object.freeze', 'Lodash cloneDeep']),
        Q('Where does BullMQ persist its jobs?', 'single', [['Redis'], 'MongoDB', 'Node process memory', 'The local file system'], 'BullMQ is built on Redis streams and sorted sets.'),
      ],
    },
  },
  {
    key: 'dsa',
    owner: 'priya',
    title: 'Data Structures & Algorithms in JavaScript',
    subtitle: 'Crack coding interviews with patterns, not memorisation.',
    description:
      'Learn the data structures and algorithm patterns that appear in almost every technical interview, using JavaScript. Every topic starts with the intuition, moves to a clean implementation and finishes with timed practice problems. Includes complexity analysis, whiteboard communication tips and mock-interview sessions.',
    category: 'Computer Science',
    level: 'beginner',
    price: 99900,
    tags: ['algorithms', 'interviews', 'javascript'],
    status: 'published',
    publishedDaysAgo: 250,
    lessons: [
      ['Complexity', 'Big-O without the maths pain', true],
      ['Complexity', 'Arrays and strings'],
      ['Core structures', 'Linked lists'],
      ['Core structures', 'Stacks and queues'],
      ['Core structures', 'Hash maps in practice'],
      ['Core structures', 'Trees and binary search trees'],
      ['Algorithms', 'Sorting algorithms'],
      ['Algorithms', 'Binary search patterns'],
      ['Algorithms', 'Recursion and backtracking'],
      ['Algorithms', 'Graphs: BFS and DFS'],
      ['Algorithms', 'Dynamic programming basics'],
    ],
    quiz: {
      title: 'Algorithms checkpoint',
      passPercent: 60,
      questions: [
        Q('What is the time complexity of binary search on a sorted array?', 'single', ['O(n)', ['O(log n)'], 'O(n log n)', 'O(1)']),
        Q('Which structures offer average O(1) lookup by key?', 'multiple', [['Hash map'], ['Hash set'], 'Linked list', 'Sorted array'], 'Both are backed by a hash table.', 2),
        TF('A stack is a first-in, first-out (FIFO) structure.', false, 'A stack is LIFO; a queue is FIFO.'),
        Q('Which traversal visits a graph level by level?', 'single', ['DFS', ['BFS'], 'In-order', 'Topological sort']),
        Q('Dynamic programming fits when a problem has…', 'single', [['Overlapping subproblems and optimal substructure'], 'A sorted input', 'No recursion', 'Unlimited memory']),
      ],
    },
  },
  {
    key: 'ui',
    owner: 'arjun',
    title: 'UI Design Fundamentals for Developers',
    subtitle: 'Make interfaces that look and feel professional – without being a designer.',
    description:
      'A short, practical course on typography, colour, spacing and accessibility, taught with before/after redesigns of real screens. You will learn the rules designers use so you can apply them confidently in code, and finish with a hand-off checklist for turning Figma files into components.',
    category: 'Design',
    level: 'beginner',
    price: 0,
    tags: ['design', 'accessibility', 'figma'],
    status: 'published',
    publishedDaysAgo: 150,
    lessons: [
      ['Principles', 'What makes a UI feel good', true],
      ['Principles', 'Typography and hierarchy'],
      ['Principles', 'Colour systems and contrast'],
      ['Layout', 'Spacing and layout grids'],
      ['Layout', 'Designing accessible components'],
      ['Layout', 'Hand-off: from Figma to code'],
    ],
    quiz: {
      title: 'Design principles quiz',
      passPercent: 70,
      questions: [
        Q('What is the minimum WCAG AA contrast ratio for normal-size text?', 'single', ['3:1', ['4.5:1'], '7:1', '2:1']),
        TF('Visual hierarchy can be created with size, weight and spacing – not only colour.', true),
        Q('Which practices make forms more accessible?', 'multiple', [['Visible labels on every input'], 'Using the placeholder as the only label', ['Linking error messages to their inputs'], 'Showing errors with colour alone'], '', 2),
        Q('An 8-point spacing grid mainly helps with…', 'single', [['Consistent rhythm and alignment'], 'Faster page loads', 'Better SEO', 'Smaller bundles']),
      ],
    },
  },
  {
    key: 'k8s',
    owner: 'arjun',
    title: 'Docker & Kubernetes for Developers',
    subtitle: 'Containerise, orchestrate and ship services with confidence.',
    description:
      'From your first Dockerfile to a multi-service deployment on Kubernetes. Covers images, networking, volumes, Compose, Deployments, Services, Ingress, config and secrets, health checks and rolling updates.',
    category: 'DevOps',
    level: 'intermediate',
    price: 199900,
    tags: ['docker', 'kubernetes', 'devops'],
    status: 'pending',
    lessons: [
      ['Docker', 'Images, containers and layers'],
      ['Docker', 'Compose for local development'],
      ['Kubernetes', 'Pods, Deployments and Services'],
    ],
  },
];

const FIRST = ['Aarav', 'Ananya', 'Rahul', 'Sneha', 'Vikram', 'Meera', 'Karthik', 'Divya', 'Rohan', 'Pooja', 'Nikhil', 'Isha', 'Manoj', 'Kavya', 'Suresh', 'Lakshmi', 'Harsha', 'Nisha', 'Pranav', 'Deepa'];
const LAST = ['Iyer', 'Nair', 'Reddy', 'Gowda', 'Shetty', 'Rao', 'Kulkarni', 'Menon', 'Bhat', 'Patil'];

async function main() {
  await connectDb();
  await Promise.all([User, Course, Lesson, Quiz, QuizAttempt, Enrollment, Payment, Certificate, LiveClass, ChatMessage].map((m) => m.deleteMany({})));

  /* ---- users (hash once, insertMany bypasses the pre-save hook) ---- */
  const password = await bcrypt.hash('Password123!', 10);
  const mk = (name, email, role, bio = '') => ({ name, email, role, bio, password });
  const base = await User.insertMany([
    mk('Site Admin', 'admin@lms.test', 'admin'),
    mk('Priya Sharma', 'priya@lms.test', 'instructor', 'Senior full-stack engineer and educator. 9 years building products with Node and React; previously at two Bengaluru SaaS startups.'),
    mk('Arjun Rao', 'arjun@lms.test', 'instructor', 'Product designer turned front-end developer. Teaches design systems, accessibility and cloud-native tooling.'),
    mk('Ananya Iyer', 'student@lms.test', 'student', 'Final-year BCA student learning full-stack development.'),
  ]);
  const [admin, priya, arjun, demoStudent] = base;
  const owners = { priya, arjun };

  const students = [];
  const usedEmails = new Set();
  while (students.length < 30) {
    const f = pick(FIRST);
    const l = pick(LAST);
    const email = `${f}.${l}${students.length + 1}@lms.test`.toLowerCase();
    if (usedEmails.has(email)) continue;
    usedEmails.add(email);
    students.push(mk(`${f} ${l}`, email, 'student'));
  }
  const fillers = await User.insertMany(students);

  /* ---- courses, lessons, quizzes ---- */
  const byKey = {};
  for (const spec of COURSES) {
    const course = await Course.create({
      title: spec.title,
      subtitle: spec.subtitle,
      description: spec.description,
      category: spec.category,
      level: spec.level,
      price: spec.price,
      currency: env.payments.currency,
      tags: spec.tags,
      instructor: owners[spec.owner]._id,
      status: spec.status,
      publishedAt: spec.publishedDaysAgo ? daysAgo(spec.publishedDaysAgo) : undefined,
    });
    const lessons = await Lesson.insertMany(
      spec.lessons.map(([section, title, isPreview], i) => ({
        course: course._id,
        section,
        title,
        order: i,
        isPreview: !!isPreview,
        description: `${title} – with worked examples and a short exercise.`,
      }))
    );
    const quiz = spec.quiz ? await Quiz.create({ ...spec.quiz, course: course._id, required: true, maxAttempts: 0 }) : null;
    byKey[spec.key] = { course, lessons, quiz };
  }

  /* ---- paid enrollments spread over ~11 months (revenue dashboard) ---- */
  const feePct = env.payments.platformFeePercent;
  const sales = [
    ['mern', 24],
    ['dsa', 15],
  ];
  const payments = [];
  const enrollments = [];
  for (const [key, count] of sales) {
    const { course, lessons } = byKey[key];
    for (let i = 0; i < count; i++) {
      const student = fillers[i % fillers.length];
      // skew towards recent months so the chart shows growth
      const paidAt = daysAgo(Math.floor(Math.pow(rand(), 1.7) * 330));
      const platformFee = Math.round((course.price * feePct) / 100);
      const payment = new Payment({
        student: student._id,
        course: course._id,
        instructor: course.instructor,
        amount: course.price,
        currency: course.currency,
        platformFee,
        instructorEarnings: course.price - platformFee,
        status: 'paid',
        provider: 'mock',
        paidAt,
        createdAt: paidAt,
      });
      payments.push(payment);
      const done = Math.floor(rand() * (lessons.length - 1));
      enrollments.push({
        student: student._id,
        course: course._id,
        source: 'paid',
        payment: payment._id,
        completedLessons: lessons.slice(0, done).map((l) => l._id),
        percent: Math.round((done / (lessons.length + 1)) * 100),
        createdAt: paidAt,
      });
    }
  }
  // Free-course enrollments
  for (let i = 0; i < 22; i++) {
    const { course, lessons } = byKey.ui;
    const done = Math.floor(rand() * (lessons.length - 1));
    enrollments.push({
      student: fillers[(i * 3) % fillers.length]._id,
      course: course._id,
      source: 'free',
      completedLessons: lessons.slice(0, done).map((l) => l._id),
      percent: Math.round((done / (lessons.length + 1)) * 100),
      createdAt: daysAgo(Math.floor(rand() * 140)),
    });
  }
  // De-duplicate (student, course) pairs – the unique index would reject repeats
  const seen = new Set();
  const uniqueEnrollments = enrollments.filter((e) => {
    const k = `${e.student}-${e.course}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  await Payment.insertMany(payments.filter((p) => seen.has(`${p.student}-${p.course}`)));
  await Enrollment.insertMany(uniqueEnrollments);

  /* ---- demo student: one finished course (certificate) and one in progress ---- */
  {
    const { course, lessons, quiz } = byKey.ui;
    const enr = await Enrollment.create({ student: demoStudent._id, course: course._id, source: 'free', completedLessons: lessons.map((l) => l._id) });
    await QuizAttempt.create({
      quiz: quiz._id, course: course._id, student: demoStudent._id,
      answers: [], results: quiz.questions.map((q) => ({ question: q._id, correct: true, earned: q.points })),
      score: quiz.questions.reduce((n, q) => n + q.points, 0), maxScore: quiz.questions.reduce((n, q) => n + q.points, 0), percent: 100, passed: true,
    });
    await recalcProgress(enr._id);
  }
  {
    const { course, lessons } = byKey.mern;
    const platformFee = Math.round((course.price * feePct) / 100);
    const paidAt = daysAgo(21);
    const payment = await Payment.create({
      student: demoStudent._id, course: course._id, instructor: course.instructor, amount: course.price, currency: course.currency,
      platformFee, instructorEarnings: course.price - platformFee, status: 'paid', provider: 'mock', paidAt,
    });
    const enr = await Enrollment.create({
      student: demoStudent._id, course: course._id, source: 'paid', payment: payment._id,
      completedLessons: lessons.slice(0, 5).map((l) => l._id), lastLesson: lessons[4]._id,
    });
    await recalcProgress(enr._id);
  }

  /* ---- live classes ---- */
  const at = (days, hourUtc, minUtc = 0) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + days);
    d.setUTCHours(hourUtc, minUtc, 0, 0);
    return d;
  };
  const past = await LiveClass.create({
    course: byKey.mern.course._id, instructor: priya._id, title: 'Live coding: RTK Query caching deep-dive',
    description: 'Cache tags, optimistic updates and invalidation patterns.', scheduledAt: at(-6, 12), durationMin: 75,
    status: 'ended', startedAt: at(-6, 12, 2), endedAt: at(-6, 13, 14),
  });
  await LiveClass.create({
    course: byKey.mern.course._id, instructor: priya._id, title: 'Live Q&A: Designing the schema for your capstone',
    description: 'Bring your capstone idea – we will model it together in Mongoose.', scheduledAt: at(1, 11, 30), durationMin: 60,
  });
  await LiveClass.create({
    course: byKey.dsa.course._id, instructor: priya._id, title: 'Mock interview: two-pointer and sliding-window problems',
    description: 'Solve two problems live and get feedback on communication.', scheduledAt: at(3, 13), durationMin: 90,
  });
  const chat = [
    [fillers[0], 'student', 'Good evening ma’am! Audio is clear 👍'],
    [priya, 'instructor', 'Welcome everyone – today we are digging into how RTK Query decides when to refetch.'],
    [fillers[3], 'student', 'Will the recording be available later?'],
    [priya, 'instructor', 'Yes, it is added to the course within a day.'],
    [fillers[7], 'student', 'Could you show invalidatesTags with a list + detail example?'],
  ];
  await ChatMessage.insertMany(
    chat.map(([u, role, text], i) => ({ liveClass: past._id, user: u._id, userName: u.name, role, text, createdAt: new Date(past.startedAt.getTime() + (i + 1) * 90_000) }))
  );

  for (const { course } of Object.values(byKey)) await refreshCourseStats(course._id);

  console.log('\nSeed complete.');
  console.log('  admin       admin@lms.test');
  console.log('  instructor  priya@lms.test  (MERN + DSA, revenue data)');
  console.log('  instructor  arjun@lms.test  (UI design + a course pending review)');
  console.log('  student     student@lms.test  (finished UI course → certificate, 38% through MERN)');
  console.log('  password    Password123!\n');
  console.log('Lessons have no video yet: upload one in the instructor editor, or run `npm run seed:videos` (needs the worker running).');
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
