FROM node:20-slim

WORKDIR /app

# Install build dependencies required for native C++ addons (better-sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install project dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code and assets
COPY . .

# Ensure storage directory exists
RUN mkdir -p storage/specs

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
