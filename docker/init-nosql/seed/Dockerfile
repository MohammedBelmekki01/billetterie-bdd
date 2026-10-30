# Image du service "seed" : s'exécute une fois puis s'arrête
FROM node:26-alpine

WORKDIR /seed
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY *.js ./

USER node
CMD ["node", "seed.js"]
