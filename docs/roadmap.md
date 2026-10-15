# UNMUTE — Roadmap

## Phase 0: Docker-First Foundation ⏳

- [x] Repository audit
- [x] Monorepo structure (backend, web, mobile, api-client)
- [x] Root `.gitignore`, `.env.example`, `package.json` with workspaces
- [x] Backend: Spring Boot skeleton, Maven Wrapper, `pom.xml`, Flyway
- [x] Backend: Security config, Actuator health, Dockerfile
- [x] Web: React + Vite + TypeScript + Tailwind CSS skeleton
- [x] Web: Dockerfile (Vite dev server)
- [x] Mobile: Expo skeleton with home screen
- [x] Shared API client with environment-aware base URL
- [x] Docker Compose: PostgreSQL, backend, web
- [x] Documentation: README, architecture.md, roadmap.md
- [ ] **VERIFY**: `docker compose build` succeeds
- [ ] **VERIFY**: `docker compose up -d` — all services running
- [ ] **VERIFY**: PostgreSQL healthy (`pg_isready`)
- [ ] **VERIFY**: Backend healthy (`/actuator/health` returns UP)
- [ ] **VERIFY**: Web reachable (`http://localhost:3000`)
- [ ] **VERIFY**: Flyway migration ran (check backend logs)
- [ ] **VERIFY**: Volume persistence (down + up preserves data)

## Phase 1: Authentication & Database Foundation 🔲

- [ ] Flyway migration: users table (UUID, email, password_hash, display_name, timestamps)
- [ ] `POST /api/v1/auth/register`
- [ ] `POST /api/v1/auth/login`
- [ ] `POST /api/v1/auth/refresh`
- [ ] `POST /api/v1/auth/logout`
- [ ] `GET /api/v1/users/me`
- [ ] JWT generation, validation, and refresh flow
- [ ] Spring Security JWT filter
- [ ] Web: Login page
- [ ] Web: Register page
- [ ] Web: Protected app shell with sidebar
- [ ] API client: auth endpoints typed
- [ ] Backend unit tests (password, JWT, validation)
- [ ] Backend integration tests (register → login → access)
- [ ] Docker services verified with auth flow

## Phase 2: Core MVP 🔲

- [ ] Notes CRUD (migration, API, web UI)
- [ ] Tasks CRUD (migration, API, web UI, status/priority)
- [ ] Projects (migration, API, web UI, associations)
- [ ] Source/Inbox (migration, API, file upload, processing status)
- [ ] Mobile: auth flow, basic navigation
- [ ] Authorization: user-scoped data access
- [ ] Pagination for list endpoints

## Phase 3: AI Processing 🔲

- [ ] Provider interfaces (transcription, analysis, embedding)
- [ ] Mock dev provider
- [ ] Real provider integration (configurable)
- [ ] Structured extraction pipeline
- [ ] Review/accept UI
- [ ] Error handling and retry

## Phase 4: Search & Assistant 🔲

- [ ] Text search
- [ ] pgvector / semantic search
- [ ] Ask UNMUTE RAG pipeline
- [ ] Source-grounded answers

## Phase 5: Knowledge Graph & iOS Polish 🔲

- [ ] Relationship model and API
- [ ] Graph visualization
- [ ] Native audio recording
- [ ] iOS file sharing

## Phase 6: Production Readiness 🔲

- [ ] Security review
- [ ] Performance optimization
- [ ] CI/CD pipeline
- [ ] Deployment documentation
