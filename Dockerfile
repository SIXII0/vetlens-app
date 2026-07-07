FROM node:22-alpine AS builder

WORKDIR /app

# 安装构建依赖
COPY package.json package-lock.json* ./
RUN npm ci

# 复制源码并构建
COPY . .
RUN npm run build

# 运行阶段
FROM node:22-alpine

WORKDIR /app

# 安装运行时依赖
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# 复制构建产物和数据文件
COPY --from=builder /app/build ./build
COPY --from=builder /app/data ./data
COPY --from=builder /app/package.json ./

# 创建数据目录
RUN mkdir -p /app/data/uploads

ENV NODE_ENV=production
ENV PORT=3000
ENV VETLENS_DB_PATH=/app/data/vetlens.db

EXPOSE 3000

CMD ["node", "build/index.js"]
