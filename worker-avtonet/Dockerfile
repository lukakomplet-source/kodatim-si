# Playwright's own image already carries Chromium and every system library it
# needs. Building on a bare node image means chasing missing .so files, which
# is the usual reason a scraper works locally and dies on the server.
FROM mcr.microsoft.com/playwright:v1.48.0-jammy

WORKDIR /app
ENV NODE_ENV=production

# Dependencies first so a code change does not reinstall Chromium's toolchain.
COPY package.json ./
RUN npm install --omit=optional

COPY tsconfig.json ./
COPY src ./src

EXPOSE 8080

# The worker answers on /health with its own state. 503 only once it has given
# up after repeated failures — a warning stays 200 on purpose, so one bad pass
# cannot turn into a restart loop that hides the real fault.
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
