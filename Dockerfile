FROM node:17-alpine as builder

ARG BUILD_FOR=production

# Set a working directory
WORKDIR /usr/src/app

COPY package.json .
COPY package-lock.json .

# Install Node.js dependencies
RUN if [ "$BUILD_FOR" = "production" ]; then npm install --production --no-progress --no-cache; else npm install --no-progress --no-cache; fi

COPY . .

ENV NODE_ENV $BUILD_FOR

CMD [ "node", "index.js" ]
