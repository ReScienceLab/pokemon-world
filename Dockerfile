FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY . .
ENV DATA_DIR=/data
RUN mkdir -p /data
EXPOSE 8099
CMD ["node", "server.mjs"]
