# 多阶段构建：node 构建产物 → nginx 托管
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
# healthz 由 nginx.conf 精确匹配返回，无需额外文件
EXPOSE 80
