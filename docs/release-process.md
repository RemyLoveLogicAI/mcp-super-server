# Release Process

1. Run `pnpm build`
2. Run `pnpm test`
3. Verify `pnpm typecheck`
4. Tag a release commit
5. Publish packages with the CI workflow

## Notes
- Ledger persistence requires Supabase env vars.
- Federation routing should be validated against multi-server fixtures.
- Real adapters should be exercised by end-to-end tests, not just mocks.
