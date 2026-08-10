# Node image plus a browser installed by Playwright itself.
#
# The obvious alternative — Microsoft's playwright:vX.Y.Z image — couples two
# versions that then have to be kept in step by hand. That coupling already
# bit once here: package.json allowed ^1.48.0, npm installed 1.62.1, and the
# pinned v1.48.0 image would have shipped browsers that 1.62 does not look
# for, so the first deploy would have died on "Executable doesn't exist"
# with nothing wrong in the code.
#
# So: a base image that only has to provide an OS, an exactly pinned
# Playwright in package.json, and `playwright install --with-deps` fetching
# the browser that this exact version wants. The two can no longer drift, and
# nothing depends on guessing which registry tags exist.
FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

# Dependencies first, so a code change does not reinstall the browser.
COPY package.json package-lock.json* ./
RUN npm install --omit=optional --no-audit --no-fund

# --with-deps installs the system libraries Chromium needs (fonts, X libs,
# codecs). Chromium only: the other engines would add hundreds of megabytes
# that this worker never opens.
RUN npx playwright install --with-deps chromium

COPY tsconfig.json ./
COPY src ./src

EXPOSE 8080

# The worker answers on / with its own state. 503 only once it has given up
# after repeated failures; a warning stays 200 on purpose, so one bad pass
# cannot become a restart loop that hides the real fault.
HEALTHCHECK --interval=60s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
