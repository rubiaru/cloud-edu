FROM mhart/alpine-node:7.10.1

WORKDIR /srv
ADD . .
RUN npm install

EXPOSE 4000
EXPOSE 5672
CMD ["node", "index.js"]
