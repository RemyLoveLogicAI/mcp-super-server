# MSS Tool Architect Skill

Teach Lazy Larry (or any other brain) how to build tools for the @mss (MCP Super-Server) architecture following the "Contract-First" rule.

## Logic
1. **Contract First**: No implementation primitives are allowed unless they exist in `@mss/core`.
2. **Gate Registration**: Every tool must be registered with a `PolicyToolGate`.
3. **Multimodal Units**: For Wan-Streamer style tools, use 160ms audio chunks and 25fps video frames.

## Boilerplate
```typescript
import { tool } from "@mss/tools";
// Import from @mss/core for contract compliance

export const myNewTool = tool({
  name: "my_tool",
  description: "Description here",
  inputSchema: { ... },
  handler: async (ctx) => {
    // Zero-trust verification first
    // Execute logic
    return { status: "success" };
  }
});
```

## Deployment
Place in `packages/tools/src/` and export via `index.ts`.
