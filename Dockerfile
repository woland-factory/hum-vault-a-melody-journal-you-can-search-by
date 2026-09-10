# Build the static bundle, then serve it with nginx. The final stage carries
# only the built assets and nginx, never node_modules.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
# SPA config and the env.js generator that runs at container start.
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.d/99-humvault-env.sh
RUN chmod +x /docker-entrypoint.d/99-humvault-env.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
# The base image's entrypoint runs scripts in /docker-entrypoint.d then starts
# nginx, so env.js is generated before the server serves.
