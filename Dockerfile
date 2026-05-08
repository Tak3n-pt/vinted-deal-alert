FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim

ENV NODE_ENV=production
ENV PORT=3000
ENV DASHBOARD_PORT=3000
ENV DATABASE_PATH=/data/deals.sqlite
ENV DASHBOARD_COOKIE_SECURE=true

WORKDIR /app
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/config.searches.example.json ./config.searches.example.json

RUN mkdir -p /data

EXPOSE 3000
CMD ["npm", "run", "serve"]
