# 部署文档 · DEPLOYMENT

## 1. 部署形态

纯前端静态站点，两种方式：

| 方式 | 场景 |
|---|---|
| 静态托管任意目录 | 内网/对象存储/任意静态服务器，构建产物即 `dist/` |
| Docker（推荐，仓库内置） | 一条命令起服务，含健康检查与缓存策略 |

## 2. 本地构建与预览

```bash
cd app-025
npm run build        # tsc -b 类型检查 + vite 构建 → dist/
npm run preview      # http://localhost:4173
```

产物结构：`dist/index.html` + `dist/assets/*`（JS/CSS 带内容哈希）+ 打包的 JSON 数据库。**无运行时后端**，数据存于浏览器 localStorage（键 `aquaplans.v1`）。

## 3. Docker 部署

```bash
cd app-025
docker compose up -d --build     # 构建并启动
curl http://localhost:8105/healthz   # → ok
docker compose down              # 停止并移除
```

### 3.1 Dockerfile（多阶段）

```dockerfile
FROM node:20-alpine AS build          # 阶段一：构建
COPY package.json package-lock.json ./
RUN npm ci                             # 锁定依赖树，保证可复现
COPY . .
RUN npm run build

FROM nginx:1.27-alpine                 # 阶段二：仅运行时
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
```

- 最终镜像不含 node_modules 与构建工具；
- 实测镜像 **21.9MB**（验收要求 <60MB）；构建上下文 <5MB（`.dockerignore` 排除 node_modules/dist/tests/e2e 等）；
- `npm ci` 依赖仓库内 `package-lock.json`，改依赖后必须提交 lock 文件。

### 3.2 docker-compose.yml

- 服务名 `app-025`，端口映射 `8105:80`（换端口只改这里左侧）；
- `restart: unless-stopped`；
- HEALTHCHECK：`wget -qO- http://127.0.0.1/healthz`，15s 间隔/3s 超时/3 次重试。

> **注意**：healthcheck 必须用 `127.0.0.1` 而非 `localhost`——容器内 `localhost` 可能解析到 IPv6（::1），而 nginx 仅监听 IPv4，会导致容器长期 `unhealthy`。

### 3.3 nginx.conf 策略

| 配置 | 说明 |
|---|---|
| `location = /healthz` | 健康检查端点，返回 200 `ok`，不记访问日志 |
| `location /assets/` | 哈希文件名资源，`max-age=31536000, immutable` 长缓存 |
| `location = /index.html` | `no-cache, no-store, must-revalidate`，保证发版即生效 |
| `location /` | SPA 回退 `try_files $uri $uri/ /index.html`（hash 路由下兜底直接输 URL 的场景） |
| gzip | text/css/js/json/svg，级别 6，阈值 1KB（水草/鱼种数据库随包发布，压缩收益明显） |

## 4. 部署验收清单（每次发版执行）

```bash
# ① 构建与类型
npm run build

# ② 全量测试（139 用例 + E2E）
npm test
E2E_BASE_URL=http://localhost:8105 E2E_NO_SERVER=1 npm run e2e   # 容器起来后

# ③ 容器健康与端点
docker ps --filter name=app-025 --format '{{.Status}}'   # → Up ... (healthy)
curl -s http://localhost:8105/healthz                    # → ok
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8105/plan/xyz/bom   # SPA 回退 → 200
curl -sI http://localhost:8105/ | grep -i cache-control  # → no-cache（index 不缓存）

# ④ 镜像大小
docker image inspect app-025-app-025 --format '{{.Size}}'    # 实测 ~21.9MB
```

E2E 在容器模式会多跑 healthz 用例（其余 3 条与 preview 模式一致）。

## 5. 常见运维操作

```bash
docker compose logs -f app-025          # 看日志（nginx access/error）
docker compose restart                  # 重启
docker compose up -d --build            # 改代码后重建（npm ci 层有 lock 缓存，通常只重建构建层）
docker compose down                     # 停止并移除容器（不动镜像）
docker image rm app-025-app-025         # 清理镜像
```

- **数据备份**：应用数据在用户浏览器 localStorage，服务端无状态，容器可随时销毁重建。
- **版本升级**：重新 `docker compose up -d --build`；因 index.html no-cache + 资源带哈希，用户刷新即拿到新版，无缓存残留问题。

## 6. 已知限制

- 端口 8105 已占用时，改 `docker-compose.yml` 端口映射左侧即可（healthcheck 不受影响，走容器内部 80）。
- 该镜像为 linux/amd64 与 arm64 官方多架构基础（nginx/node alpine），Apple Silicon 与 x86 服务器均可直接构建。
- 未配置 HTTPS/域名——如需对外发布，建议在前置一层 Traefik/Caddy/云 LB 做 TLS，容器只暴露 HTTP。
