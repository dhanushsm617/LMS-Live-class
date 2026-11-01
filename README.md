# LearnHub – Learning Management System with Live Classes

MERN + WebRTC (LiveKit) + FFmpeg + AWS CloudFront + BullMQ + Redux Toolkit.

## What's implemented (maps to your 7 steps)

| # | Requirement | Where |
|---|---|---|
| 1 | Roles (student / instructor / admin), course, lesson, enrollment schema | `server/src/models/*`, `middleware/auth.js` (`requireRole`), `services/access.js` |
| 2 | Course creation + video upload → FFmpeg in a BullMQ job → HLS | `routes/lessons.routes.js` (upload → 202), `queues/videoQueue.js`, `workers/videoWorker.js`, `services/ffmpeg.js` |
| 3 | Delivery through CloudFront | `services/cloudfront.js` (signed cookies scoped to `hls/<lessonId>/*`), `services/storage.js` (S3) |
| 4 | Quizzes with auto-grading + progress tracking | `services/quizGrading.js`, `services/progress.js`, `routes/quizzes.routes.js`, `routes/enrollments.routes.js` |
| 5 | Live classes (WebRTC via LiveKit) + chat | `routes/live.routes.js` (token), `sockets/chat.js` (Socket.IO, persisted), `client/src/pages/live/*` |
| 6 | PDF certificates on completion | `services/certificatePdf.js` (PDFKit), auto-issued in `services/progress.js`, public verify page `/verify/:code` |
| 7 | Instructor revenue dashboard + payments (test mode) | `routes/payments.routes.js` (Stripe Checkout + webhook, or built-in mock), `routes/instructor.routes.js`, `client/src/pages/teach/Revenue.jsx` |

## Architecture

```
React + Redux Toolkit (RTK Query)  ──/api──►  Express API ──► MongoDB
        │  HLS (hls.js)                          │  enqueue
        │  LiveKit client (WebRTC)               ▼
        │  Socket.IO (chat)                   Redis ◄── BullMQ worker (FFmpeg → HLS ladder)
        ▼                                                       │ upload
   CloudFront (signed cookies) ◄──────────────────────────── S3 bucket (private)
```

Key design decisions
- **Uploads never block the API.** The API stores the raw file, enqueues a BullMQ job and returns `202`. A separate worker process runs FFmpeg (3 retries, exponential backoff, progress reported to the instructor UI).
- **Adaptive streaming.** FFmpeg produces an HLS ladder (360p/720p/1080p, only rungs ≤ source height) with 6-second segments.
- **Private media.** The S3 bucket is private; CloudFront reads it via Origin Access Control. Playback endpoint checks enrollment (or free-preview flag) then sets *signed cookies* limited to that one lesson's prefix. Raw uploads (`raw/*`) are never exposed.
- **Idempotent payments.** The webhook and the success-page verification both call `fulfilPayment`, which atomically flips `pending → paid` once, so access is granted exactly once.
- **Auto-grading is server-side only.** Correct answers are stripped before a quiz is sent to students and only revealed after passing.
- **Course completion** = all lessons completed (≥80% watched) + all *required* quizzes passed → certificate issued once.
- **Chat** is separate from media (Socket.IO + Redis adapter, persisted in MongoDB, rate-limited), so it survives a dropped WebRTC connection.

## Run it locally

Prerequisites: Node 20+, FFmpeg on PATH, Docker (for Mongo / Redis / LiveKit).

The project requires Redis 5.0 or newer. The Redis Windows service installed on
some machines is Redis 3.0.504 and will not work with BullMQ. Use the Redis 7
container below. If the container cannot bind port 6379 because the old Windows
service is already using it, stop that service from an elevated PowerShell
window with `Stop-Service Redis`, then start the containers.

```bash
docker compose up -d                      # MongoDB, Redis, LiveKit (dev mode)

cd server
cp .env.example .env
npm install
npm run seed                              # demo data (wipes the LMS collections!)
npm run dev                               # API  → http://localhost:5000
npm run worker                            # FFmpeg/BullMQ worker (second terminal)
npm run seed:videos                       # optional: pushes a generated test video through the pipeline

cd ../client
npm install
npm run dev                               # UI   → http://localhost:5173
```

Demo accounts (password `Password123!`):

| Role | Email | Notes |
|---|---|---|
| Student | `student@lms.test` | finished the free UI course (certificate), 5 lessons into MERN |
| Instructor | `priya@lms.test` | MERN + DSA courses, ~11 months of sales for the revenue chart |
| Instructor | `arjun@lms.test` | has a course **pending review** |
| Admin | `admin@lms.test` | approve / reject courses, manage users |

Walk-through: sign in as Priya → *Teach* → open a course → upload a video on a lesson (watch it go queued → encoding → ready) → sign in as the student → watch it → take the quiz → finish the course → download the certificate.

### Payments (test mode)
- No config: built-in **mock checkout** (walks the same pending-payment → fulfil → enroll path).
- Real Stripe test mode: set `STRIPE_SECRET_KEY=sk_test_…`. For webhooks run `stripe listen --forward-to localhost:5000/api/payments/webhook` and put the printed secret in `STRIPE_WEBHOOK_SECRET`. Pay with card `4242 4242 4242 4242`. (The success page also verifies directly with Stripe, so it works even without the webhook.)

## Production: S3 + CloudFront

1. Create a **private** S3 bucket. Give the API and worker an IAM role with `s3:PutObject/GetObject/DeleteObject/ListBucket` on it.
2. Create a CloudFront distribution with the bucket as origin (Origin Access Control). Add a **key group** (upload the public key of an RSA key pair) and set it as the *trusted key group* on the behavior → viewers must present signed cookies.
3. Put the API and CDN under one parent domain (e.g. `app.example.com`, `cdn.example.com`) so cookies set with `CLOUDFRONT_COOKIE_DOMAIN=.example.com` are sent to the CDN.
4. Add a response-headers policy allowing CORS from your app origin with credentials.
5. Set `.env`: `STORAGE_DRIVER=s3`, `S3_BUCKET`, `CLOUDFRONT_DOMAIN`, `CLOUDFRONT_KEY_PAIR_ID`, `CLOUDFRONT_PRIVATE_KEY`, `CLOUDFRONT_COOKIE_DOMAIN`, `JWT_SECRET`, `COOKIE_SECURE=true`.
6. Run the API and the worker as separate services (they share Redis + MongoDB). Scale workers horizontally.
7. For live classes in production use LiveKit Cloud or a self-hosted LiveKit with TURN, and set `LIVEKIT_URL`, `LIVEKIT_PUBLIC_URL`, key and secret.

## API overview

```
POST /api/auth/register | login | logout      GET /api/auth/me
GET  /api/courses                              catalog (search, filters, sort, pagination)
GET  /api/courses/:slug                        public detail (+ access state)
POST /api/courses                              instructor: create draft
GET  /api/courses/:id/manage                   editor payload (lessons, quizzes, live classes)
POST /api/courses/:id/submit                   request admin review
POST /api/courses/:id/lessons                  add lesson          PUT …/lessons/reorder
POST /api/lessons/:id/video                    multipart upload → BullMQ job (202)
GET  /api/lessons/:id/playback                 HLS URL + signed cookies
POST /api/enrollments/free/:courseId           PUT/POST …/lessons/:lid/position | complete
POST /api/quizzes/:id/attempts                 auto-graded attempt
POST /api/payments/checkout                    Stripe Checkout session (or mock)
POST /api/payments/webhook                     Stripe webhook (raw body, signature verified)
GET  /api/instructor/revenue                   revenue dashboard data
POST /api/live/:id/token                       LiveKit access token (host can publish, students subscribe)
GET  /api/certificates/:id/download            PDF       GET /api/certificates/verify/:code (public)
```

## Known limits / next steps
- Subtitles, DRM, and per-rendition thumbnails/sprites are not included.
- Refunds are recorded from Stripe's `charge.refunded` event but do not revoke enrollment automatically.
- Instructor payouts (Stripe Connect) are out of scope; the dashboard shows earnings after the configured platform fee.
- No automated test suite yet; the FFmpeg ladder and quiz grading were exercised manually.
