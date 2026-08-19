# Build context is the repository ROOT, not apps/web:
# apps/web resolves `@ausfall/domain` through a Vite path alias into packages/domain.
#
#   docker build -f apps/web/Dockerfile -t ausfall-web .

FROM node:24-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY pnpm-lock.yaml* ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm install --no-frozen-lockfile --filter "@ausfall/web..."
# Vite inlines these at build time; they cannot be set at run time.
ARG VITE_API_URL=http://localhost:4000
ARG VITE_APP_NOW=2026-09-07T07:40:00+02:00
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_APP_NOW=$VITE_APP_NOW
RUN pnpm --filter "@ausfall/web" build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Nitro bundles the server; .output is self-contained.
COPY --from=build /repo/apps/web/.output ./.output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
