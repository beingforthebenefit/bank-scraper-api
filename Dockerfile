FROM node:20-alpine

WORKDIR /app

# Copy package files and install deps
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copy app source
COPY . .

# Environment defaults
ENV PORT=3000
ENV DATA_DIR=/app/.state

# Prepare state dir
RUN mkdir -p ${DATA_DIR}

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "const http = require('http'); \
    const req = http.request({hostname:'localhost',port:3000,path:'/health',method:'GET'},(res)=>{process.exit(res.statusCode===200?0:1)}); \
    req.on('error', ()=>process.exit(1)); req.end();"

CMD ["node", "server.js"]
