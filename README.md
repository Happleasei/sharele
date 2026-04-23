# sharele

sharele 是一个“移动职业/兴趣角色地图”Web 平台。

## 核心流程
1. 用户进入网站
2. 登录
3. 实名认证
4. 选择角色（如移动摄影师、移动化妆师、移动模特、移动小吃摊、移动骑友、移动登山客等）
5. 进入地图查看附近/在线的对应角色人群

## 当前阶段
- 需求确认 + 技术方案设计中
- 目标端：Web 优先，后续嵌入手机 App（需移动端适配）

## 本地开发

### 后端
```powershell
cd D:\webDevelop\sharele\backend
npm install
npm run dev
```

### 前端
```powershell
cd D:\webDevelop\sharele\frontend
npm install
npm run dev
```

## 前端运行时配置

前端配置统一通过 `window.__SHARELE_CONFIG__` 注入。

参考文件：
- `frontend/amap-config.js`
- `frontend/config.example.js`

可配置项：
```js
window.__SHARELE_CONFIG__ = {
  envName: 'local',
  apiBase: '',
  amapKey: '你的高德地图 key',
  amapSecurityJsCode: '你的高德安全密钥'
}
```

## 健康检查

后端提供：
- `/health`：存活状态 + DB 状态
- `/ready`：服务是否 ready

详见：`docs/RUNBOOK.md`

## PM2 持续运行（推荐）

如果要避免临时终端关闭后后端进程被杀，推荐用 PM2：

```powershell
cd D:\webDevelop\sharele\backend
pm2 start ecosystem.config.cjs
pm2 save
```

项目内脚本：
- `backend/scripts/start-pm2.ps1`
- `backend/scripts/restart-pm2.ps1`

## 文档
- `docs/PRD.md`：产品需求草案
- `docs/ARCHITECTURE.md`：架构与数据模型草案
- `docs/RUNBOOK.md`：启动、配置、健康检查、故障排查

## 安全说明
请勿将真实数据库密码提交到 Git 仓库。建议使用 `.env` 本地配置。
