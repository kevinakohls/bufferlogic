FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY tests ./tests
COPY examples ./examples
RUN npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --from=build --chown=node:node /app/dist/src ./dist/src
COPY --from=build --chown=node:node /app/examples ./examples
COPY --chown=node:node package.json ./
COPY --chown=node:node ui ./ui
USER node
EXPOSE 8080
CMD ["node", "dist/src/ui-server.js"]
