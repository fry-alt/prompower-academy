# Прод-образ PROMPOWER Academy (§11 брифа: Dockerfile для прода).
# Сборка в три ступени: зависимости → сборка Next.js → минимальный рантайм.
# Next собирается в режиме standalone: в образ попадает только то, что нужно
# серверу, без dev-зависимостей и без исходников.

FROM node:22-alpine AS deps
WORKDIR /app
# Воркспейсы и скрипт postinstall (кладёт декодер Draco в public/draco) нужны
# уже на установке.
COPY package.json package-lock.json .npmrc ./
COPY packages ./packages
COPY scripts ./scripts
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT=standalone
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/public/draco ./public/draco
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Уроки читаются с диска и на сервере: каталог курсов — источник истины (§7).
COPY --from=build --chown=node:node /app/content ./content

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
