# VoiceDesk

An AI receptionist for small businesses. It answers the business's phone line, holds a natural
conversation, checks real availability, books the appointment on the owner's Google Calendar and
texts the caller a confirmation. The owner sees every call, its transcript and an AI summary in a
web dashboard.

![Dashboard overview](docs/screenshots/overview.png)

## What it does

- **Answers calls in real time.** Twilio streams the call audio over a WebSocket to the server, which
  relays it to the OpenAI Realtime API and streams the spoken reply back. Replies start in well under a second.
- **Handles interruptions.** If the caller talks over the agent, playback stops immediately and the
  model's memory of its reply is trimmed to what the caller actually heard.
- **Books for real.** The model calls tools (`check_availability`, `book_appointment`,
  `get_business_info`) backed by the business's opening hours, its existing bookings and its Google Calendar.
  Two callers can't get the same slot; a database constraint settles the race.
- **Follows up in the background.** Calendar sync, SMS confirmations and call summaries run on a
  Redis-backed job queue with retries, so a slow third-party API never stalls a live call.
- **Gives the owner a dashboard.** Calls with transcripts and summaries, upcoming appointments, and
  settings for the greeting, hours and services.

| Call transcript | Settings |
| --- | --- |
| ![Call detail](docs/screenshots/call-detail.png) | ![Settings](docs/screenshots/settings.png) |

## Architecture

```mermaid
flowchart LR
    caller((Caller)) -- phone call --> twilio[Twilio]
    twilio -- "POST /twilio/voice" --> api
    twilio <-- "Media Stream (WebSocket, G.711)" --> api

    subgraph aws [AWS - ECS Fargate]
      api["API service<br/>Node.js + Fastify"]
      worker["Worker<br/>BullMQ"]
      web["Dashboard<br/>Next.js"]
    end

    api <-- "Realtime API (WebSocket)" --> openai[OpenAI]
    api --> pg[(PostgreSQL)]
    api -- enqueue jobs --> redis[(Redis)]
    redis --> worker
    worker --> gcal[Google Calendar]
    worker -- SMS --> twilio
    worker -- summaries --> openai
    worker --> pg
    web -- "REST /api (bearer token)" --> api
    owner((Owner)) --> web
```

### Life of a call

1. A call comes in. Twilio sends a signed webhook to `POST /twilio/voice`. The server checks the
   `X-Twilio-Signature`, looks up the business by the number that was dialed, records the call, and
   answers with TwiML that connects the call audio to `wss://…/twilio/media`.
2. On the media WebSocket, `CallBridge` ([apps/server/src/realtime/bridge.ts](apps/server/src/realtime/bridge.ts))
   opens a Realtime API session with instructions built from that business's hours, services and
   notes, plus today's date in its timezone. Both sides speak 8 kHz mu-law, so audio is relayed
   without transcoding.
3. When the model wants to check times or book, it emits a function call. The bridge runs it through
   the [tool handler](apps/server/src/agent/tools.ts), which calls the `BookingService` and returns
   JSON. Errors the caller can fix ("that time was just taken") come back as data, so the agent can
   apologize and offer another slot instead of the call failing.
4. A booking is written as `PENDING` and a `calendar-sync` job is queued. The worker creates the
   calendar event, marks the appointment `CONFIRMED` and queues an SMS confirmation.
5. When the call ends, the transcript is saved and a `call-summary` job asks a small model for a
   two-sentence summary for the dashboard.

### Design decisions

- **Slots are computed in the business's timezone** with Luxon, so daylight saving changes and split
  shifts (lunch breaks) need no special cases. See [slots.ts](apps/server/src/scheduling/slots.ts) and its tests.
- **No double bookings.** Availability is checked first, but the real guarantee is a unique index on
  `(businessId, startsAt)`. An integration test fires two simultaneous bookings at Postgres and
  expects exactly one to win.
- **Jobs are idempotent.** Each job checks current state before acting and uses a deterministic job
  ID, so retries never create a second calendar event or a second text. A calendar sync that runs
  out of retries marks the appointment `FAILED`, which shows up in the dashboard.
- **Barge-in.** The bridge tracks the stream timestamp when each agent reply started playing. When the
  caller starts speaking, it sends Twilio a `clear` and sends the model a `conversation.item.truncate`
  with how many milliseconds were actually heard.
- **The dashboard never sees the API token.** All API calls happen in server components and server
  actions; the browser only talks to Next.js.

## Tech stack

| Area | Tools |
| --- | --- |
| Voice and AI | Twilio Programmable Voice and Media Streams, OpenAI Realtime API (speech-to-speech with tool calling), OpenAI Responses API for summaries |
| Backend | Node.js 22, TypeScript, Fastify, WebSockets, Zod, Prisma, PostgreSQL, BullMQ, Redis |
| Frontend | Next.js 16 (App Router, server components, server actions), React 19, Tailwind CSS 4 |
| Integrations | Google Calendar API (service account), Twilio SMS |
| Infrastructure | AWS ECS Fargate, ALB, RDS PostgreSQL, ElastiCache Redis, ECR, Secrets Manager, CloudWatch, Terraform |
| CI/CD | GitHub Actions: lint, typecheck, unit and integration tests, Docker builds, Terraform validation; OIDC deploys to ECS with migrations and automatic rollback |
| Testing | Vitest, Fastify `inject`, real Postgres and Redis in CI |

## Running it locally

Requirements: Node.js 22+, Docker.

```bash
npm install
docker compose up -d postgres redis

cp apps/server/.env.example apps/server/.env   # add your OPENAI_API_KEY
cp apps/web/.env.example apps/web/.env         # same ADMIN_API_TOKEN as the server

npm run db:deploy -w apps/server               # apply migrations
npm run db:seed:demo -w apps/server            # demo barbershop with sample calls

npm run dev -w apps/server                     # API on :8080
npm run dev:worker -w apps/server              # job worker
npm run dev -w apps/web                        # dashboard on :3000
```

Without Twilio or Google credentials, SMS messages are printed to the worker's console and bookings
go to an in-memory calendar, so you can try everything except a real phone call.

### Taking a real phone call

1. Expose the API: `ngrok http 8080` (or `cloudflared tunnel`), and set `PUBLIC_URL` to the HTTPS URL.
2. Buy a Twilio number and set its "A call comes in" webhook to `POST {PUBLIC_URL}/twilio/voice`.
3. Run the seed with that number: `SEED_PHONE_NUMBER=+1XXXXXXXXXX npm run db:seed -w apps/server`.
4. Add `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` to `apps/server/.env` and call the number.

To sync with Google Calendar, create a service account, share the calendar with its email address,
put the key JSON in `GOOGLE_SERVICE_ACCOUNT_JSON`, and set the business's `calendarId`.

## Tests

```bash
npm test                    # unit tests (server and web)

# integration tests need a database whose name contains "test"
docker compose exec postgres createdb -U voicedesk voicedesk_test
export DATABASE_URL=postgresql://voicedesk:voicedesk@localhost:5432/voicedesk_test
export REDIS_URL=redis://localhost:6379/1
npm run db:deploy -w apps/server
npm run test:integration
```

Unit tests cover slot finding (including DST), the booking rules, the tool handler, the call bridge
(audio relay, barge-in, tool calls, transcripts) and the Twilio webhook (including signature checks).
Integration tests run against real Postgres and Redis: the double-booking race, job retries, the
admin API and queue de-duplication.

## Deployment

Infrastructure is in [infra/terraform](infra/terraform): a VPC with public and private subnets, an ALB
routing `api.<domain>` and `app.<domain>`, RDS Postgres, ElastiCache Redis, and three Fargate
services (API, worker, dashboard). The API autoscales on CPU.

```bash
cd infra/terraform
cp environments/staging.backend.hcl.example environments/staging.backend.hcl   # your state bucket
cp environments/staging.tfvars.example environments/staging.tfvars            # domain, cert, repo
terraform init -backend-config=environments/staging.backend.hcl
terraform apply -var-file=environments/staging.tfvars
```

Then:

1. Put the app secrets in the Secrets Manager secret from the `app_secret_name` output.
2. Create a `staging` environment in the GitHub repo with these variables: `AWS_REGION`,
   `AWS_DEPLOY_ROLE_ARN`, `PRIVATE_SUBNETS` (comma-separated), `TASK_SECURITY_GROUP` and `API_HOST`.
3. Point the Twilio number's webhook at the `twilio_voice_webhook` output.

Every push to `main` that passes CI is deployed to staging by
[deploy.yml](.github/workflows/deploy.yml): build and push images to ECR, run `prisma migrate deploy`
as a one-off Fargate task, then roll out the worker, API and dashboard, waiting for each to become
healthy. ECS rolls back automatically if new tasks fail their health checks. Production deploys run
from the same workflow by hand.

## Project layout

```
apps/
  server/
    src/
      agent/        instructions and tool definitions for the voice model
      realtime/     Twilio <-> OpenAI Realtime bridge
      booking/      availability and booking rules, repositories
      scheduling/   opening hours and slot finding
      calendar/     Google Calendar and in-memory providers
      jobs/         background job handlers (calendar sync, SMS, summaries)
      routes/       Twilio webhooks and the admin REST API
      index.ts      API entry point
      worker.ts     job worker entry point
    prisma/         schema, migrations, seed
    test/integration
  web/              Next.js dashboard
infra/terraform     AWS infrastructure
.github/workflows   CI and deploy pipelines
```

## Ideas for later

- Transfer to a human when the caller asks, using Twilio `<Dial>`
- Cancel and reschedule by phone or by replying to the SMS
- Multiple staff calendars with per-person availability
- Per-business usage metering for billing

## License

MIT
