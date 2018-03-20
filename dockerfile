FROM node:alpine

RUN apk add tzdata --update --no-cache && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && echo "Asia/Shanghai" /etc/localtime && apk del tzdata

COPY . /src/app
WORKDIR /src/app

RUN npm i --production && npm cache clean --force

CMD node .

EXPOSE 46434
