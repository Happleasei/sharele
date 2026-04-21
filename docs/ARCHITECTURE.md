# sharele 架构草案

## 1. 建议技术栈（Web + App嵌入友好）
- 前端：Vue 3 + Vite（或 React + Vite，二选一）
- UI：移动优先响应式布局
- 地图：高德地图 JS SDK（国内场景优先）
- 后端：Node.js (NestJS/Express)
- 数据库：MySQL
- 认证：JWT + Refresh Token

## 2. 领域模型（V1）

### user（用户）
- id
- phone/email
- password_hash
- real_name
- id_card_no（建议加密存储）
- verify_status（pending/approved/rejected）
- created_at / updated_at

### role（角色）
- id
- code（photographer/makeup/model/snack/cyclist/hiker/...）
- name
- category（职业/兴趣）

### user_role（用户角色关系）
- id
- user_id
- role_id
- is_primary

### user_location（用户位置）
- id
- user_id
- lat
- lng
- geohash
- is_online
- updated_at

## 3. 核心接口（示意）
- POST /auth/register
- POST /auth/login
- POST /verify/realname
- GET /roles
- POST /user/roles
- GET /map/nearby?role=photographer&lat=..&lng=..

## 4. 安全与隐私
- 精确坐标只用于服务计算，前端可做位置模糊化展示
- 身份证号等敏感字段加密存储
- 严格区分开发/生产配置
- 禁止将真实密码写入 Git

## 5. 环境变量示例
参考 `.env.example`，本地创建 `.env`。