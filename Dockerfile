# syntax=docker/dockerfile:1

# ---------- Build stage ----------
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------- Runtime stage ----------
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# Writable uploads dir + run as non-root
RUN mkdir -p /app/public/uploads \
 && addgroup -S app && adduser -S app -G app \
 && chown -R app:app /app
USER app
EXPOSE 5000
# Container-level health check (LB/orchestrator also hit GET /health)
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "const p=process.env.PORT||5000;require('http').get('http://127.0.0.1:'+p+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "dist/server.js"]
