# Stage 1: Install dependencies and build
FROM node:20-slim AS builder

WORKDIR /app

# Copy workspace root files
COPY package.json package-lock.json tsconfig.base.json ./

# Copy package.json files for all needed packages (for npm ci)
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/

# Install all workspace dependencies
RUN npm ci

# Copy source code
COPY packages/core/ packages/core/
COPY packages/server/ packages/server/
COPY packages/web/ packages/web/

# Build core → server → web
RUN npm run build:core
RUN npm run build:server
RUN npm run build:web

# Stage 2: Production runtime
FROM node:20-slim AS runtime

WORKDIR /app

# Copy workspace root package files
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/

# Install production dependencies only
RUN npm ci --omit=dev --workspace=packages/core --workspace=packages/server

# Copy built artifacts
COPY --from=builder /app/packages/core/dist/ packages/core/dist/
COPY --from=builder /app/packages/server/dist/ packages/server/dist/
COPY --from=builder /app/packages/web/dist/ packages/web/dist/

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "packages/server/dist/index.js"]
