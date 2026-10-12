# TRAYDAQ Media Engine

Stage: working code foundation, NOT deployed into the live TRAYDAQ app.
Firebase remains the authority for authentication and post records. Supabase
Storage remains the original-file store and CDN. The optional FFmpeg worker is
separate from the Android APK/web-server thread. No existing posts are deleted.

## System design

    Creator Studio --signed original upload--> Supabase public media bucket
        | (Firebase identity token + owned source path)
        v
    Media gateway (Supabase Edge) --> private-to-app job queue
                                              |
                                              v
                                 FFmpeg single-job worker
                                              |
                    +-------------------------+
                    v
             Optimized MP4 + HLS + cover photo
                    |
                    v
             Same Supabase public media bucket
                    |
           For You / Following
           use optimized when ready; fallback to original

## Implemented files

- worker.mjs: checks source against authenticated owner, downloads only public
  video from the known storage bucket, probes using ffprobe, rejects >50 MB and
  >180 seconds, encodes 360p-class and optional 720p-class MP4, prepares
  adaptive HLS renditions and a cover image. The master playlist uploads last.
- sql/001_media_jobs.sql: queue table with strict access, RLS, ownership columns,
  and atomic claim/retry using SKIP LOCKED. Private user tables are untouched.
- edge/index.ts: Firebase JWT-authenticated POST enqueue and GET owned status;
  user ID always comes from verified JWT. Limits: 20 jobs/day, 4 concurrent
  queued jobs per person.
- client/playback.mjs: prefers optimized MP4 for Android compatibility, uses
  native HLS only when supported, falls back once to the original after error.
- Dockerfile: Node 22 + FFmpeg non-root processor; disabled by default.
- render.yaml: optional Render background worker blueprint (paid host may be
  needed), disabled by default, with external secret configuration.
- tests/worker.test.mjs and GitHub Actions media-engine-ci.yml for pure tests
  and security regression checks.

## Activation steps: do not skip

1. Check the public GitHub Media Engine Tests Action and video test fixtures.
2. Configure a separate Render worker (or another worker host) with enough CPU
   and disk. Video encoding on the ordinary request-serving web server is risky.
3. Apply sql/001_media_jobs.sql using Supabase migrations/SQL after review.
4. Deploy edge/index.ts as the Supabase Edge Function traydaq-media-engine,
   with its pinned edge/deno.json import map and verify_jwt=false ONLY because
   the function verifies Firebase RS256 tokens on every request itself.
5. Set SUPABASE_SERVICE_ROLE_KEY as a server-only worker secret. Never commit,
   paste into ChatGPT, or put into the Android APK. Set
   TRAYDAQ_MEDIA_ENGINE_ENABLED=true when the queue and gateway work.
6. Upload one test video from a Firebase-signed-in account and POST its original
   storage path to the Edge Function. Check status GET and output files.
7. Add job-submission/status polling to Creator Studio AFTER the existing upload
   completes; never block successful publication while optimizing.
8. Link successful results to the correct authenticated post, and gradually
   enable optimized playback. If processing or CDN fails, use the original.
9. Monitor first-frame latency, playback errors, storage/bandwidth quota, failed
   jobs and worker CPU costs before broad rollout.

## Gateway request contracts

POST /functions/v1/traydaq-media-engine
Authorization: Bearer <Firebase ID Token>
Content-Type: application/json
Body: {"sourcePath":"media/<owned-uid>/posts/<uploaded-file>.mp4"}

GET /functions/v1/traydaq-media-engine?id=<job-uuid>
Authorization: Bearer <Firebase ID Token>

Pending: job { id, state, attempts, createdAt }.
Ready: also includes playback { hlsUrl, mp4Url, posterUrl, originalUrl }.
Failed: original file remains available, optimized URLs not advertised.

## Security, quotas and costs

- Strict public video paths only. NO Ghana Card, private applicant documents,
  fraud evidence, private music masters, user tokens or arbitrary URLs.
- Public bucket videos are public by design; private videos need another model.
- Exactly one worker processes jobs at a time. FFmpeg receives fixed arguments,
  never user-controlled shell flags. Files are bounded and temp files cleaned.
- Partial derived files after a failed encode may need periodic orphan cleanup.
- Worker is not a browser or image service; no production secrets in GitHub.
- Software and FFmpeg are free. Render worker hosting, Supabase Storage and
  bandwidth may still charge. This does not promise unlimited free video.
- Supabase provides CDN caching for public assets; optional smart CDN/image
  transformation features depend on the user's subscription level.
- HLS requires player support; the Android helper defaults to MP4. hls.js is
  NOT magically integrated with existing For You views.
- The APK, upload signer and Firebase post logic remain unchanged until the
  backend is activated and Android integration is tested.

## Validation / rollback

Run:
    node --check media-engine/worker.mjs
    node --check media-engine/client/playback.mjs
    node --test media-engine/tests/worker.test.mjs

These checks do NOT establish that the media engine is live. A real signed
upload and transcode test against Supabase is required.

To roll back: disable job submissions and stop the encoder worker.
Existing For You posts continue playing their original media; never remove
existing uploads to recover from pipeline problems.
