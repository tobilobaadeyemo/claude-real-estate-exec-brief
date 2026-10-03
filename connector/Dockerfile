# Full image for the build: it ships python3, make, and g++, which better-sqlite3 needs
# when no prebuilt binary matches this Node version. Same Debian release and Node
# version as the slim runtime below, so the compiled module is ABI compatible.
FROM node:22 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY test ./test
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# Starts as root only to take ownership of the mounted disk, then the server
# drops to the unprivileged node user (uid 1000) before opening the database.
ENV RUN_AS_UID=1000 RUN_AS_GID=1000 DATABASE_PATH=/data/connector.db PORT=3000
RUN mkdir -p /data
EXPOSE 3000
CMD ["node", "dist/src/server.js"]
