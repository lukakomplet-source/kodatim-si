# Playwright's own image already carries Chromium and every system library it
# needs — building on a bare node image means chasing missing .so files, which
# is the usual reason a scraper works locally and dies on the server.
FROM mcr.microsoft.com/playwright:v1.48.0-jammy

WORKDIR /app

COPY package.json ./
RUN npm install --omit=optional

COPY tsconfig.json ./
COPY src ./src

# Long-running process: the scheduler lives inside the worker, so the host only
# has to keep one container alive and restart it if it exits.
CMD ["npm", "start"]
