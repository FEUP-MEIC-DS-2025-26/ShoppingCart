
FROM node:18-alpine


WORKDIR /app


COPY package*.json ./


RUN npm install


COPY . .


EXPOSE 4000

# Conditional ENV based on ARG
ENV DATABASE_URL_CLOUD=madeinportugal-store-ds2025:europe-west2:cart-db
ENV DATABASE_URL_LOCAL=postgresql://postgres:postgres@db:5432/cartdb

CMD [ "node", "index.js" ]
