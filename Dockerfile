FROM node:22-alpine
WORKDIR /app
COPY server.js config.json ./
COPY public ./public
RUN mkdir recordings && chown node:node recordings
USER node
ENV HOST=0.0.0.0 PORT=4400
EXPOSE 4400
CMD ["node", "server.js"]
