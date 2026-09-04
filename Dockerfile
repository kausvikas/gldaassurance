# The deployment unit (ADR-0010 §7, ADR-0032 §3).
#
# One artefact across every environment; configuration differs and the build does not. Cloud Run is
# the target because ADR-0001 and ADR-0010 rejected serverless on determinism and audit-continuity
# grounds, and because a container runs the same code a developer runs.
#
# DEMO — SYNTHETIC DATA. This image contains no real client, employee or financial data.
FROM node:22-slim

WORKDIR /app

# Dependencies first, so a source change does not re-resolve them. `--omit=dev` is deliberate: the
# runtime needs decimal.js and nothing else, and every package absent from this image is a package
# that cannot read the credential this process holds.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY tsconfig.json vitest.config.ts ./
COPY src ./src
COPY server ./server
COPY scripts ./scripts
COPY architecture ./architecture
COPY data ./data
COPY METRIC_CATALOG.md ./

# vite-node is a dev dependency, so the TypeScript entrypoint is run through the same loader the
# tests use. A separate compiled artefact would be a second build with its own failure modes for no
# benefit at this scale.
RUN npm install --no-save vite-node vite typescript

# Not root. A parser handling untrusted bytes should not be able to write to the image.
USER node

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["npx", "vite-node", "-c", "vitest.config.ts", "server/start.ts"]
