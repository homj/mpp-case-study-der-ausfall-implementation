# Build context is the repository root, so the whole pnpm workspace and the
# case-study data land in the image.
FROM node:24-alpine

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app
COPY . .

# Use the lockfile when it exists; fall back to a fresh resolve when it does not.
RUN pnpm install --frozen-lockfile || pnpm install

ENV PORT=4000
EXPOSE 4000

# Applies migrations, seeds master data, ingests the 08:00 export, then listens.
CMD ["pnpm", "--filter", "@ausfall/api", "start"]
