# UNMUTE — Architecture

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Backend | Spring Boot | 3.4.x |
| Language | Java (target) | 21 LTS |
| Database | PostgreSQL + pgvector | 16 |
| Migrations | Flyway | managed by Spring Boot |
| Auth | JWT (access + refresh tokens) | jjwt 0.12.x |
| Web | React + TypeScript + Vite | React 19, Vite 6 |
| Styling | Tailwind CSS | 4.x |
| Mobile | React Native + Expo | Expo 52 |
| HTTP State | TanStack Query | 5.x |
| Containers | Docker + Docker Compose | — |

## Monorepo Layout

```
unmute/
├── backend/              Java/Maven — independently buildable
├── apps/web/             React — npm workspace
├── apps/mobile/          Expo — npm workspace
├── packages/api-client/  Shared TypeScript client — npm workspace
├── docs/                 Project documentation
└── docker-compose.yml    Development orchestration
```

**Coordination strategy:**
- JavaScript packages use **npm workspaces** from the root `package.json`.
- The backend is an independent **Maven project** (not part of npm workspaces).
- Shared API types live in `packages/api-client` and are consumed by both web and mobile.

## Docker Services

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Network                        │
│                   (unmute-network)                        │
│                                                          │
│  ┌────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │  PostgreSQL │    │  Spring Boot │    │  React/Vite  │ │
│  │    (db)     │◄───│  (backend)   │◄───│   (web)      │ │
│  │  :5432      │    │  :8080       │    │  :3000       │ │
│  └────────────┘    └──────────────┘    └──────────────┘ │
│        │                                                  │
│   unmute-pgdata                                          │
│   (persistent volume)                                    │
└─────────────────────────────────────────────────────────┘
```

### Service Details

| Service | Image | Ports | Health Check |
|---------|-------|-------|-------------|
| `db` | `pgvector/pgvector:pg16` | 5432 | `pg_isready` |
| `backend` | Custom (multi-stage) | 8080 | `curl /actuator/health` |
| `web` | Custom (node:22-alpine) | 3000 | — |

### Volume & Data Persistence

PostgreSQL data is stored in the named volume `unmute-pgdata`.

- `docker compose down` — **preserves data** (volume survives)
- `docker compose down -v` — **deletes data** (use only when you want a fresh DB)

**Never delete volumes during normal development.** Flyway migrations are additive and handle schema evolution.

## Networking

### Docker Internal

Containers communicate using Docker service names as hostnames:
- Backend → DB: `jdbc:postgresql://db:5432/unmute`
- Web → Backend: `http://backend:8080` (via Vite proxy)

**Never use `localhost` between containers.** `localhost` inside a container refers to that container itself.

### Host Access

All services expose ports to the host machine:
- DB: `localhost:5432`
- Backend: `localhost:8080`
- Web: `localhost:3000`

### iOS Networking

```
┌──────────────────────────────────────────────┐
│              Developer Machine               │
│                                              │
│  Docker:                                     │
│  ┌────┐  ┌─────────┐  ┌─────┐              │
│  │ DB │──│ Backend  │──│ Web │              │
│  └────┘  └────┬─────┘  └─────┘              │
│               │ :8080                        │
│               │ exposed to host              │
├───────────────┼──────────────────────────────┤
│               │                              │
│  iOS Simulator connects to localhost:8080    │
│  (Simulator shares macOS host network)       │
│                                              │
│  Physical iPhone connects to <LAN_IP>:8080  │
│  (must be on same WiFi network)              │
│                                              │
└──────────────────────────────────────────────┘
```

**Physical iPhone setup:**
1. Find your machine's LAN IP: `ipconfig` (Windows) or `ifconfig` (macOS)
2. Set `EXPO_PUBLIC_API_BASE_URL=http://<LAN_IP>:8080` in `.env`
3. Ensure port 8080 is not blocked by firewall
4. Both devices must be on the same network

## Authentication Architecture

```
Client                        Backend
  │                              │
  │  POST /api/v1/auth/login     │
  │  { email, password }         │
  │─────────────────────────────►│
  │                              │ Validate credentials
  │                              │ Generate access + refresh tokens
  │  { accessToken,              │
  │    refreshToken, user }      │
  │◄─────────────────────────────│
  │                              │
  │  GET /api/v1/users/me        │
  │  Authorization: Bearer <AT>  │
  │─────────────────────────────►│
  │                              │ Validate JWT
  │  { user profile }            │
  │◄─────────────────────────────│
  │                              │
  │  POST /api/v1/auth/refresh   │
  │  { refreshToken }            │
  │─────────────────────────────►│
  │                              │ Validate refresh token
  │  { accessToken }             │
  │◄─────────────────────────────│
```

- **Access tokens**: Short-lived (15 min default), JWT, stateless validation
- **Refresh tokens**: Longer-lived (7 days default), stored in DB, revocable
- **Password hashing**: BCrypt
- **Web storage**: Access token in memory, refresh token handled per security best practice
- **Mobile storage**: Expo SecureStore for refresh token

## Backend Module Structure

```
com.unmute
├── common
│   ├── config       # Security, CORS, app config
│   ├── exception    # Global error handling
│   └── web          # Shared API utilities
├── auth             # Authentication endpoints & JWT
├── user             # User profile
├── source           # File uploads & processing
├── note             # Notes CRUD
├── task             # Task management
├── project          # Project organization
├── search           # Text & semantic search
└── ai               # Provider interfaces & pipeline
```

Each module contains: Controller → Service → Repository → DTOs → Entity.

## Security Principles

1. **No plaintext passwords** — BCrypt hashing only
2. **No client-trusted IDs** — ownership verified server-side on every request
3. **No secrets in source** — all credentials via environment variables
4. **No entity serialization** — DTOs for all API responses
5. **Stateless auth** — JWT validated per-request, no server sessions
6. **CORS configured** — explicit origins in production
7. **File validation** — type and size checked before storage
8. **SQL injection protected** — JPA parameterized queries only
