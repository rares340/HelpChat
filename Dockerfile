FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci

COPY shared shared
COPY backend backend
COPY frontend frontend

RUN npm run build -w frontend

FROM node:22-bookworm-slim

WORKDIR /app

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/shared shared
COPY --from=build /app/backend backend
COPY --from=build /app/frontend/dist frontend/dist

ENV PORT=3001
EXPOSE 3001

# Migrațiile rulează la pornire (idempotente), apoi pornește serverul.
CMD ["sh", "-c", "npm run migrate -w backend && npm run start -w backend"]
