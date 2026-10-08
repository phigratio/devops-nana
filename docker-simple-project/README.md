# Profile CRUD App

Express + vanilla JS over MongoDB, fully containerised. No auth on the app itself.

The MongoDB **collection is the table**: database `user-account`, collection `users`,
one document per user.

---

## Quick start

```bash
make init        # generate secrets + .env
make build       # build the app image
make up          # start mongo + app
make health      # confirm it is alive
```

Open <http://localhost:3000>.

Without `make`, the same four steps:

```bash
./scripts/generate-secrets.sh
cp .env.example .env
docker compose build
docker compose up -d
curl localhost:3000/api/health
```

---

## Every command

### Setup

| Command | What it does |
| --- | --- |
| `make init` | Generates `secrets/*.txt` and copies `.env.example` to `.env`. Safe to re-run. |
| `make secrets` | Generates only the password files. Existing ones are left alone. |

### Running

| Command | What it does |
| --- | --- |
| `make build` | Builds the app image. |
| `make up` | Starts mongo + app in the background. |
| `make ps` | Container status and health. |
| `make logs` | Follows logs from all services. |
| `make health` | `curl`s `/api/health`. |
| `make restart` | Restarts just the app (after a config change). |
| `make down` | Stops everything. **Data is kept.** |
| `make nuke` | Stops everything and **deletes the database volume.** |

### Development

| Command | What it does |
| --- | --- |
| `make dev` | Starts with the dev overlay: live reload, Mongo published on 27017. |
| `make dev-down` | Stops the dev stack. |
| `make shell` | Shell inside the app container. |
| `make db-shell` | `mongosh` inside the Mongo container, as root. |

### Admin UI

| Command | What it does |
| --- | --- |
| `make tools` | Starts mongo-express at <http://127.0.0.1:8081>. |
| `docker compose --profile tools down` | Stops it. |

Login is `ME_USERNAME` / `ME_PASSWORD` from `.env` (`admin` / `change-me` by default —
**change it**). It is bound to loopback only; reach it remotely over an SSH tunnel:

```bash
ssh -L 8081:127.0.0.1:8081 you@server
```

### Backup and restore

| Command | What it does |
| --- | --- |
| `make backup` | Dumps the database to `backups/mongo-<timestamp>.gz`. |
| `make restore FILE=backups/mongo-....gz` | Restores a dump (`--drop`, so it replaces). |

### Raw compose equivalents

```bash
docker compose build
docker compose up -d
docker compose up -d --wait              # block until healthchecks pass
docker compose ps
docker compose logs -f app
docker compose restart app
docker compose down                      # keep data
docker compose down -v                   # delete data
docker compose --profile tools up -d     # include mongo-express

# dev overlay
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

---

## Deploying to a server

```bash
# 1. Copy the repo over (without node_modules / secrets / .env)
rsync -av --exclude node_modules --exclude secrets --exclude .env ./ you@server:/srv/profile-app/

# 2. On the server
cd /srv/profile-app
make init                      # generates FRESH secrets on that host
vi .env                        # set APP_BIND=127.0.0.1 and a real ME_PASSWORD
make build && make up
make health
```

Put a reverse proxy (nginx, Caddy, Traefik) in front for TLS, and set
`APP_BIND=127.0.0.1` in `.env` so the app is reachable only through the proxy.

To update:

```bash
git pull
docker compose build
docker compose up -d           # recreates only what changed
```

---

## What makes this production-shaped

**Secrets are files, not environment variables.** Passwords live in `secrets/*.txt`,
mounted at `/run/secrets/...`. They are never baked into an image, never visible in
`docker inspect`, never in `.env`. The app reads `MONGO_PASSWORD_FILE`; Mongo and
mongo-express read their own `*_FILE` variables.

**The app does not use the root database account.** On first boot,
`mongo-init/01-create-app-user.sh` creates an `app` user with `readWrite` on the one
database it needs. Verified: that user is denied access to the `admin` database.

**The database is not reachable from anywhere.** Mongo publishes no host port and sits
on an `internal: true` network, so it has no route to or from the outside world. Only
the app and mongo-express, which straddle both networks, can see it. The dev overlay
publishes 27017 on loopback when you need Compass or mongosh.

**The app container is locked down.** Runs as the unprivileged `node` user (uid 1000),
read-only root filesystem with a 16 MB tmpfs for `/tmp`, `cap_drop: ALL`, and
`no-new-privileges`.

**Health-gated startup.** The app waits for `mongo` to pass its healthcheck before it
starts, and has its own healthcheck hitting `/api/health`, so `docker compose up --wait`
and any orchestrator can tell real readiness from "the process started".

**Graceful shutdown.** `init: true` for proper signal handling, the app closes its Mongo
client on `SIGTERM`, and `stop_grace_period` gives it room.

**Bounded resources and logs.** CPU/memory limits per service; JSON logs capped at
3 × 10 MB so a chatty container cannot fill the disk.

**Pinned images.** `mongo:7.0.14`, `mongo-express:1.0.2`, `node:22-alpine`. No `latest`.

### Not included — decide these per deployment

- **TLS.** Terminate at a reverse proxy in front of the app.
- **Replica set.** Single-node Mongo means no failover and no transactions.
- **Offsite backups.** `make backup` writes locally; ship those files somewhere else.
- **Monitoring.** `/api/health` is there for a probe to scrape; nothing scrapes it yet.
- **Rate limiting / auth on the app.** By design there is none.

---

## Configuration

`.env` holds non-secret settings; passwords are files in `secrets/`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_PORT` | `3000` | Published host port |
| `APP_BIND` | `0.0.0.0` | Bind address; use `127.0.0.1` behind a proxy |
| `APP_VERSION` | `1.0.0` | Image tag |
| `DB_NAME` | `user-account` | Database name |
| `MONGO_ROOT_USERNAME` | `root` | Mongo root user |
| `MONGO_APP_USERNAME` | `app` | Least-privilege app user |
| `MONGO_PORT` | `27017` | Dev overlay only |
| `MONGO_EXPRESS_PORT` | `8081` | Tools profile only |
| `ME_USERNAME` / `ME_PASSWORD` | `admin` / `change-me` | mongo-express login |

Secret files, created by `make secrets`:

- `secrets/mongo_root_password.txt`
- `secrets/mongo_app_password.txt`

Both are gitignored. **Back them up** — losing the app password means recreating the
database user by hand.

---

## API

| Method | Path | Does |
| --- | --- | --- |
| `POST` | `/api/users` | Create. `name` required. |
| `GET` | `/api/users` | List all. `?q=` searches name/title/email/location. |
| `GET` | `/api/users/:id` | Read one. |
| `PUT` | `/api/users/:id` | Replace — omitted fields reset to defaults. |
| `PATCH` | `/api/users/:id` | Merge — only the fields you send change. |
| `DELETE` | `/api/users/:id` | Delete, returns the removed document. |
| `GET` | `/api/health` | Database ping. |

Fields: `name` (required), `title`, `email`, `location`, `bio`, `avatarUrl`.
The server adds `createdAt` / `updatedAt` and exposes Mongo's `_id` as `id`.

```bash
curl -X POST localhost:3000/api/users -H 'Content-Type: application/json' \
  -d '{"name":"Grace Hopper","title":"Rear Admiral","email":"grace@example.com"}'

curl localhost:3000/api/users
curl 'localhost:3000/api/users?q=grace'
curl -X PATCH localhost:3000/api/users/<id> -H 'Content-Type: application/json' \
  -d '{"title":"Commodore"}'
curl -X DELETE localhost:3000/api/users/<id>
```

`email` is optional but carries a **unique partial index**. A blank email is stored as a
missing field, so any number of users may have none, while a duplicate returns `409`.

---

## Running without Docker

Needs a MongoDB you can reach:

```bash
npm install
MONGO_URL='mongodb://admin:password@localhost:27017/?authSource=admin' npm start
```

`MONGO_URL` overrides the host/user/password pieces entirely.

---

## Troubleshooting

**`Permission denied` reading `/run/secrets/...`** — compose bind-mounts secret files
with their host permissions and ignores the `mode` key outside swarm. The files must be
world-readable (`chmod 644`); `generate-secrets.sh` handles this and keeps the directory
at `0700` instead.

**`Authentication failed` on first start** — the init script only runs when the data
volume is empty. If you regenerated secrets against an existing volume, the stored
password no longer matches. `make nuke` and start again, or change the password in
mongosh.

**Port already in use** — something else holds 3000/8081. Change `APP_PORT` or
`MONGO_EXPRESS_PORT` in `.env`.

**mongo-express exits with `Password contains unescaped characters`** — it does not
URL-encode passwords. `generate-secrets.sh` uses hex for exactly this reason; don't
replace the secrets with base64 ones.

---

## Files

```
server.js                        app wiring, health check, error handler
db.js                            Mongo connection, secret loading, collection registry
users.js                         CRUD routes and validation
public/                          frontend (index.html, style.css, app.js)
Dockerfile                       multi-stage build, non-root runtime, healthcheck
docker-compose.yml               production stack
docker-compose.dev.yml           development overlay
mongo-init/01-create-app-user.sh runs once on first boot; creates the app user
scripts/generate-secrets.sh      creates secrets/*.txt
Makefile                         wrappers for everything above
.env.example                     copy to .env
```
