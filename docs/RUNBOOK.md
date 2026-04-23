# sharele Runbook

## 1. 本地启动

### 后端
```powershell
cd D:\webDevelop\sharele\backend
npm install
npm run dev
```

默认端口：`3000`

### 前端
```powershell
cd D:\webDevelop\sharele\frontend
npm install
npm run dev
```

默认端口：`5173`

## 2. 关键健康检查

### 存活检查 `/health`
```bash
curl http://127.0.0.1:3000/health
```

返回字段说明：
- `ok`: 当前 DB 是否可用
- `app`: Node 服务是否已启动
- `db`: 数据库是否可连接
- `schemaReady`: 启动后的 schema 初始化是否完成
- `startupError`: 启动期错误信息
- `timestamp`: 检查时间

> 说明：即使数据库异常，后端进程现在也会先启动，并返回 JSON，而不是直接退出。

### 就绪检查 `/ready`
```bash
curl http://127.0.0.1:3000/ready
```

- `200`: 服务已 ready
- `503`: schema 尚未 ready 或启动失败

## 3. 线上 502 排查顺序

当 `https://shareleapi.wh1997.com/health` 返回 502 时，优先按下面顺序查：

1. 后端进程是否还活着
2. `3000` 端口是否监听
3. 本机 `curl http://127.0.0.1:3000/health`
4. 数据库是否可连
5. 反向代理 / Cloudflare 是否只是转发了坏源站

### 常用命令
```bash
ss -ltnp | grep 3000
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/ready
```

如果使用 PM2：
```bash
pm2 list
pm2 logs sharele-backend --lines 100
```

如果使用 Docker：
```bash
docker ps
docker logs <container_name> --tail 100
```

## 4. 前端运行时配置

前端统一通过 `window.__SHARELE_CONFIG__` 注入运行时配置。

参考：`frontend/config.example.js`

字段：
```js
window.__SHARELE_CONFIG__ = {
  envName: 'prod',
  apiBase: 'https://shareleapi.wh1997.com',
  amapKey: '你的高德地图 key',
  amapSecurityJsCode: '你的高德安全密钥'
}
```

当前前端会按以下优先级选择 API：
1. `window.__SHARELE_CONFIG__.apiBase`
2. `localStorage.sharele_api_base`
3. 自动探测（本地 / 当前域名 / shareleapi.wh1997.com）

## 5. 离线浏览模式

如果后端不可用：
- 前端会进入“离线浏览模式”
- 可继续浏览地图、角色、页面结构
- 登录 / 实名 / 保存资料 / 发起互动会被拦截并提示

这属于预期降级，不代表前端坏了。

## 6. 当前已知注意事项

- 前端 `5173` 端口若已被占用，重复启动会报 `EADDRINUSE`
- 这通常说明前端已经在运行，不是代码挂掉
- 数据库异常时，`/health` 会返回 `app=true, db=false`
- 如果线上只看 Cloudflare 502，要继续追源站，不要误判成前端故障
