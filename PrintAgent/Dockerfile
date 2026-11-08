FROM node:22.21.1-bookworm-slim@sha256:25b3eb23a00590b7499f2a2ce939322727fcce1b15fdd69754fcd09536a3ae2c
WORKDIR /app
COPY contract.mjs demo-server.mjs ./
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "demo-server.mjs"]
