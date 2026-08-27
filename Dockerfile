FROM node:22-slim
WORKDIR /app
# Install all deps (including Vite/Nitro) before NODE_ENV=production.
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NITRO_PRESET=node-server
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV NITRO_HOST=0.0.0.0
RUN npm run build:railway
EXPOSE 3000
CMD ["npm", "run", "start"]
