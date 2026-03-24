# Infrastructure

Deployment configurations for MCP Super-Server.

## Directory Structure

```
infra/
├── docker/      # Container configurations
│   └── (Dockerfiles, docker-compose)
└── railway/     # Railway deployment configs
    └── (railway.toml, service configs)
```

## Deployment Targets

| Target | Status | Notes |
|--------|--------|-------|
| Railway | Planned | Primary deployment target |
| Docker | Planned | Local development, self-hosted |
| Kubernetes | Future | Enterprise scale |

## Database

Default: Supabase (Postgres) for event ledger.

## Secrets Management

- JIT credentials preferred
- Short-lived tokens
- Tool-scoped credentials only

See Whitepaper §7.2: Credential Strategy
