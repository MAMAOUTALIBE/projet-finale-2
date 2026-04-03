FROM node:20.19.5-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN node ./node_modules/@angular/cli/bin/ng build --configuration production

FROM node:20.19.5-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/dist/nowa-angular-21 ./dist
COPY server.mjs ./

EXPOSE 8080

CMD ["node", "server.mjs"]
