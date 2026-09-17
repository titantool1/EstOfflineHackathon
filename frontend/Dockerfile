FROM node:24.14.1-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Only the public JavaScript map key is a build argument.
ARG NEXT_PUBLIC_KAKAO_MAP_KEY=""
ENV NEXT_PUBLIC_KAKAO_MAP_KEY=$NEXT_PUBLIC_KAKAO_MAP_KEY
RUN npm run test:ai && npm run test:server && npm run test:catalog && npm run test:conversation && npm run test:neighborhood && npm run test:interests && npm run test:missions && npm run test:mission-ui && npx eslint src/app/api/health/route.ts src/app/api/ai src/app/api/signup src/app/api/profile src/app/api/missions src/app/api/activity src/features src/lib/server tests/spring-client.test.ts tests/catalog-tools.test.ts tests/kakao-local.test.ts tests/neighborhood-bff.test.ts tests/neighborhood-client.test.ts tests/neighborhood-state.test.ts tests/interests.test.ts tests/missions.test.ts tests/mission-ui.test.ts tests/interest-ui.test.ts tests/mission-detail-bff.test.ts tests/mission-detail-ui.test.ts tests/mission-board.test.ts src/app/missions src/app/onboarding src/app/profile/page.tsx src/app/map/mission && npm run build

FROM node:24.14.1-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
