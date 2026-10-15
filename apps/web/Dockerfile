# ---- Development stage ----
FROM node:22-alpine AS dev

WORKDIR /app

# Copy workspace root package files
COPY package.json .npmrc* ./

# Copy api-client package
COPY packages/api-client/package.json packages/api-client/

# Copy web app package
COPY apps/web/package.json apps/web/

# Install all workspace dependencies
RUN npm install --workspace=apps/web --workspace=packages/api-client --include-workspace-root

# Copy source files
COPY packages/api-client packages/api-client
COPY apps/web apps/web

WORKDIR /app/apps/web

EXPOSE 3000

CMD ["npm", "run", "dev"]
