FROM node:22-bookworm-slim

WORKDIR /app

# Install build tools and SQLite development headers
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    sqlite3 \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

# Install project dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Force rebuild of better-sqlite3 from source to prevent ABI mismatch and SIGSEGV 139
RUN npm rebuild better-sqlite3 --build-from-source

# Copy source code and assets
COPY . .

# Ensure storage directory exists
RUN mkdir -p storage/specs

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
