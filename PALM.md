# Palm host

Second public MCP host. Does not replace Director (`https://luvlogic.zo.space/api/mcp`).

Import this **branch**, not `master`.

- Repo: `RemyLoveLogicAI/mcp-super-server`
- Branch: `palm-host`
- Region: AUTO
- Health: `/health`
- MCP: `/mcp`
- Start: Dockerfile `CMD` already runs `pnpm --filter @mss/server http`
- Env (optional): `LOVELOGIC_DIRECTOR_MCP=https://luvlogic.zo.space/api/mcp`
- Skip `.env` unless you have `MCP_API_SECRET`

KanBot stays Zo-loopback (`127.0.0.1:8794`). Palm lists local super.* tools plus Director tools.
