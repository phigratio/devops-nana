# devops-nana

Projects built while working through DevOps material — containers, orchestration,
pipelines. Each directory is a self-contained project with its own README.

## Projects

| Project | Stack | What it covers |
| --- | --- | --- |
| [docker-simple-project](./docker-simple-project) | Node, Express, MongoDB, Docker Compose | CRUD app over MongoDB, containerised with a hardened production compose stack: file-based secrets, a least-privilege database user, an internal-only database network, healthcheck-gated startup, and a non-root read-only app container. |

## Layout

Every project stands alone. Clone the repo, `cd` into one, and follow its README —
nothing is shared between them and no root-level install step exists.

```
devops-nana/
├── README.md                this file
├── .gitignore               shared ignores (secrets, node_modules, backups)
└── docker-simple-project/   project with its own README, Makefile, compose files
```

## Conventions

Things that hold across the projects here:

- **No credentials in the repo.** Secrets are generated locally by a script and
  gitignored. Every project ships a `.env.example` showing the shape, never the values.
- **Pinned image tags.** No `latest` in any compose file.
- **A README per project** covering setup, every command, and what is deliberately
  left out.
