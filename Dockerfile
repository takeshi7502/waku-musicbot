FROM node:20-alpine
RUN apk add --no-cache docker-cli
WORKDIR /usr/src/app
COPY . .
RUN npm install
CMD sh -c "npm run deploy && node index.js"

