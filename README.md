# UNMUTE

**Your mind, finally in motion.**

AI-powered personal knowledge workspace that captures scattered thoughts, voice recordings, documents, screenshots, and ideas — transforms them into structured knowledge — connects related information — and helps you turn thoughts into actionable tasks.

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (v20+) and Docker Compose (v2+)
- [Node.js](https://nodejs.org/) (v20+) and npm (v10+)
- [JDK 21+](https://adoptium.net/) (for running backend tests on host)

### 1. Clone and configure

```bash
git clone <repo-url> unmute
cd unmute
cp .env.example .env
```

Edit `.env` if needed. Defaults work for local development.

### 2. Start all services (Docker)

```bash
docker compose up --build -d
```

This starts:
- **PostgreSQL 16** (with pgvector) on port `5432`
- **Spring Boot backend** on port `8080`
- **React web app** (Vite dev) on port `3000`

### 3. Verify

```bash
# Check service status
docker compose ps

# Backend health check
curl http://localhost:8080/actuator/health

# View logs
docker compose logs -f backend

# Open web app
# Navigate to http://localhost:3000
```

### 4. Stop services

```bash
# Stop containers (preserves database data)
docker compose down

# Stop AND delete database data (use with caution)
docker compose down -v
```

## Project Structure

```
unmute/
├── apps/
│   ├── web/            # React + Vite + TypeScript + Tailwind CSS
│   └── mobile/         # React Native + Expo (iOS)
├── backend/            # Spring Boot 3.4 + Java 21 (Maven)
├── packages/
│   └── api-client/     # Shared TypeScript HTTP client
├── docs/               # Architecture, roadmap, API docs
├── docker-compose.yml  # Development environment
├── .env.example        # Environment variable template
└── package.json        # npm workspaces root
```

## Development Commands

### Docker (recommended)

| Command | Description |
|---------|-------------|
| `docker compose up --build -d` | Build and start all services |
| `docker compose ps` | Check service status |
| `docker compose logs -f` | Follow all logs |
| `docker compose logs -f backend` | Follow backend logs only |
| `docker compose down` | Stop services (data preserved) |
| `docker compose down -v` | Stop services AND delete data |

### Backend (on host, requires JDK 21+)

```bash
cd backend
./mvnw.cmd spring-boot:run    # Start (Windows)
./mvnw spring-boot:run        # Start (macOS/Linux)
./mvnw.cmd test               # Run tests (Windows)
```

> **Note**: Backend requires PostgreSQL. Start it first with `docker compose up db -d`.

The default test command excludes the PostgreSQL row-lock test. That test talks only to a disposable database on `127.0.0.1:5433` and fails, rather than skipping, when that database is down:

```bash
docker compose -p unmute-it -f docker-compose.it.yml up -d --wait
cd backend
./mvnw.cmd test -Ppostgres-it
docker compose -p unmute-it -f docker-compose.it.yml down
```

### Web (on host)

```bash
npm install
npm run dev:web
npm run test -w apps/web    # Vitest
npm run build:web
```

In-process baselines for briefing rank, inbox classification, and graph preparation are in [docs/performance/2026-10-19-baseline.md](docs/performance/2026-10-19-baseline.md). Calendar conflict cases that still need a Google account are in [docs/calendar-sync.md](docs/calendar-sync.md).

Login, registration, token refresh, AI calls, chat messages, and file uploads are limited per process. A caller who exceeds the limit receives `429` and `Retry-After`. Authenticated AI and upload limits follow the user id. Login limits follow the client address. The counts are not shared across backend replicas and reset on restart. Change them with `RATE_LIMIT_AUTH_CAPACITY`, `RATE_LIMIT_AI_CAPACITY`, and `RATE_LIMIT_UPLOAD_CAPACITY`.

### Database backup

Backups run inside the Compose database container, so they do not use whatever is listening on the host's port 5432. Dump files go in `backups/`, which is gitignored.

```powershell
.\scripts\db\backup.ps1
.\scripts\db\restore.ps1 -Confirm -DumpFile backups\unmute-YYYYMMDD-HHMMSS.dump -Database unmute_it -ComposeFile docker-compose.it.yml -ProjectName unmute-it -Service db-it -DbUser unmute_it -VerifySql "SELECT 1"
```

Restore refuses `docker-compose.yml` and refuses the application database name. It only accepts `unmute_it`, `unmute_restore`, or a name ending in `_restore`, and only after `-Confirm`. Start the disposable database first with `docker compose -p unmute-it -f docker-compose.it.yml up -d --wait`.

### Mobile (on host, requires macOS for iOS Simulator)

```bash
npm install
npm run dev:mobile
```

See [docs/architecture.md](docs/architecture.md) for networking configuration for iOS Simulator and physical iPhone.

## Networking Guide

| Environment | API Base URL | Notes |
|---|---|---|
| Web inside Docker | Proxied via Vite → `backend:8080` | Uses Docker network |
| Web on host | `http://localhost:8080` | Direct connection |
| iOS Simulator (macOS) | `http://localhost:8080` | Simulator shares host network |
| Physical iPhone | `http://<LAN_IP>:8080` | Set `EXPO_PUBLIC_API_BASE_URL` in `.env` |
| Production | `https://api.unmute.app` | Placeholder |

## Documentation

- [Architecture](docs/architecture.md) — Tech stack, Docker services, networking, security
- [Roadmap](docs/roadmap.md) — Phased implementation plan with status
- [API](docs/api.md) — Endpoint reference (created as endpoints are implemented)

## License

Private — All rights reserved.
