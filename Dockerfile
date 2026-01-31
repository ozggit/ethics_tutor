FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 \
  make \
  g++ \
  && rm -rf /var/lib/apt/lists/*
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN mkdir -p /ms-playwright && chmod 0777 /ms-playwright
COPY package.json package-lock.json* ./
RUN npm install

# Optional: install Playwright browsers for containerized UI tests.
# This won't affect runtime image size because this stage isn't shipped.
RUN npx playwright install --with-deps chromium

# Tester image for containerized Playwright runs.
# IMPORTANT: this stage is based on `deps` so it retains the OS deps
# installed by `playwright install --with-deps`.
FROM deps AS tester
WORKDIR /app
COPY . .

FROM node:20-bookworm-slim AS builder
WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY --from=deps /ms-playwright /ms-playwright
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
RUN useradd -m -u 1001 -s /bin/bash nextjs \
  && mkdir -p /app/data /app/.next/cache \
  && chown -R nextjs:nextjs /app/data /app/.next
USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
