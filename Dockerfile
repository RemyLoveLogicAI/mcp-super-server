FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
COPY packages ./packages
COPY apps ./apps
COPY turbo.json tsconfig.base.json vitest.config.ts ./
RUN pnpm install --frozen-lockfile
RUN pnpm build
CMD ["pnpm", "--filter", "@mss/server", "start"]
