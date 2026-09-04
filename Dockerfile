# The deployment unit (ADR-0010 §7, ADR-0032 §3).
#
# One artefact across every environment; configuration differs and the build does not. Cloud Run is
# the target because ADR-0001 and ADR-0010 rejected serverless on determinism and audit-continuity
# grounds, and because a container runs the same code a developer runs.
#
# DEMO — SYNTHETIC DATA. This image contains no real client, employee or financial data.
FROM node:22-slim

WORKDIR /app

# Dependencies first, so a source change does not re-resolve them.
#
# `--omit=dev` keeps the *application's* dependency set to decimal.js and nothing else. Be precise
# about what that does and does not buy: the toolchain below adds vite and vite-node so the
# TypeScript entrypoint can run, so this image is not dependency-free — only the code that touches
# the credential and the untrusted bytes is. Removing the toolchain would mean compiling ahead of
# time, which the source cannot do today because it uses constructor parameter properties that
# Node's type stripping rejects. Recorded rather than glossed: an image comment that overstates its
# own posture is worse than none.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY tsconfig.json vite.config.ts ./
COPY src ./src
COPY server ./server
COPY scripts ./scripts
COPY architecture ./architecture
COPY data ./data
COPY METRIC_CATALOG.md ./

# The TypeScript entrypoint runs through the same loader the tests use, so what runs in the cloud is
# what runs on a developer's machine.
RUN npm install --no-save vite-node vite typescript

# `vite` writes a bundled copy of its config beside the config file before loading it, so the
# working directory has to be writable by the user that runs the process. Without this the container
# started, failed with EACCES on a temporary file nobody had heard of, and Cloud Run reported only
# that it had not listened on the port.
RUN chown -R node:node /app

# Not root. A process parsing untrusted bytes should own its working directory and nothing else.
USER node

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["npx", "vite-node", "-c", "vite.config.ts", "server/start.ts"]
