import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { pool } from './db.js'
import { authRequired } from './middleware/auth.js'

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())

async function ensureColumn(tableName, columnName, definitionSql) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName]
  )
  if (Number(rows?.[0]?.count || 0) > 0) return
  await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definitionSql}`)
}

async function ensureSchema() {
  await ensureColumn('users', 'avatar_url', 'VARCHAR(255) NULL')
  await ensureColumn('users', 'bio', 'VARCHAR(255) NULL')
  await ensureColumn('users', 'gender', 'VARCHAR(16) NULL')
  await pool.query(`CREATE TABLE IF NOT EXISTS interactions (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    from_user_id BIGINT NOT NULL,
    to_user_id BIGINT NOT NULL,
    message VARCHAR(255) NULL,
    status ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_to_created (to_user_id, created_at),
    KEY idx_from_created (from_user_id, created_at)
  ) ENGINE=InnoDB`)
}

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ ok: true, db: true })
  } catch {
    res.status(500).json({ ok: false, db: false })
  }
})

app.post('/auth/register', async (req, res) => {
  const { phone, password, nickname } = req.body || {}
  if (!phone || !password) return res.status(400).json({ message: 'phone/password 必填' })
  const [exists] = await pool.query('SELECT id FROM users WHERE phone=? LIMIT 1', [phone])
  if (exists.length) return res.status(400).json({ message: '手机号已注册' })
  const hash = await bcrypt.hash(password, 10)
  const [ret] = await pool.query(
    'INSERT INTO users (phone, password_hash, nickname, verify_status) VALUES (?, ?, ?, ?)',
    [phone, hash, nickname || null, 'pending']
  )
  res.json({ id: ret.insertId })
})

app.post('/auth/login', async (req, res) => {
  const { phone, password } = req.body || {}
  const [rows] = await pool.query('SELECT id, phone, password_hash, verify_status FROM users WHERE phone=? LIMIT 1', [phone])
  const user = rows[0]
  if (!user) return res.status(400).json({ message: '账号不存在' })
  const ok = await bcrypt.compare(password || '', user.password_hash || '')
  if (!ok) return res.status(400).json({ message: '密码错误' })
  const token = jwt.sign({ uid: user.id, phone: user.phone }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '7d' })
  res.json({ token, user: { id: user.id, phone: user.phone, verifyStatus: user.verify_status } })
})

app.post('/verify/realname', authRequired, async (req, res) => {
  const body = req.body || {}
  const realName = String(body.realName ?? body.real_name ?? '').trim()
  const idCardNo = String(body.idCardNo ?? body.id_card_no ?? '').trim()
  if (!realName || !idCardNo) return res.status(400).json({ message: 'realName/idCardNo 必填' })
  await pool.query('UPDATE users SET real_name=?, id_card_no=?, verify_status=? WHERE id=?', [realName, idCardNo, 'approved', req.user.uid])
  res.json({ ok: true })
})

app.get('/roles', async (_req, res) => {
  const [rows] = await pool.query('SELECT id, code, name, category FROM roles ORDER BY id ASC')
  res.json(rows)
})

app.post('/user/roles', authRequired, async (req, res) => {
  const { roleIds = [], primaryRoleId = null } = req.body || {}
  const normalizedRoleIds = Array.from(new Set((roleIds || []).map(x => Number(x)).filter(Number.isFinite)))

  if (!normalizedRoleIds.length) {
    return res.status(400).json({ message: '请至少选择一个角色' })
  }

  const [exists] = await pool.query(
    `SELECT id FROM roles WHERE id IN (${normalizedRoleIds.map(() => '?').join(',')})`,
    normalizedRoleIds
  )
  if (exists.length !== normalizedRoleIds.length) {
    return res.status(400).json({ message: '包含无效角色' })
  }

  const primary = Number(primaryRoleId || normalizedRoleIds[0])
  await pool.query('DELETE FROM user_roles WHERE user_id=?', [req.user.uid])
  for (const roleId of normalizedRoleIds) {
    await pool.query('INSERT INTO user_roles (user_id, role_id, is_primary) VALUES (?, ?, ?)', [req.user.uid, roleId, Number(roleId) === primary ? 1 : 0])
  }
  res.json({ ok: true, primaryRoleId: primary })
})

app.post('/user/location', authRequired, async (req, res) => {
  const { lat, lng, isOnline = true } = req.body || {}
  await pool.query(
    `INSERT INTO user_locations (user_id, lat, lng, is_online) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE lat=VALUES(lat), lng=VALUES(lng), is_online=VALUES(is_online), updated_at=CURRENT_TIMESTAMP`,
    [req.user.uid, lat, lng, isOnline ? 1 : 0]
  )
  res.json({ ok: true })
})

app.get('/user/me', authRequired, async (req, res) => {
  const [users] = await pool.query(
    `SELECT id, phone, nickname, real_name realName, verify_status verifyStatus,
            avatar_url avatarUrl, bio, gender
     FROM users WHERE id=? LIMIT 1`,
    [req.user.uid]
  )
  const user = users[0]
  if (!user) return res.status(404).json({ message: '用户不存在' })

  const [roles] = await pool.query(
    `SELECT r.id, r.code, r.name, r.category, ur.is_primary isPrimary
     FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id=?
     ORDER BY ur.is_primary DESC, r.id ASC`,
    [req.user.uid]
  )

  const [locations] = await pool.query(
    `SELECT lat, lng, is_online isOnline, updated_at updatedAt FROM user_locations WHERE user_id=? LIMIT 1`,
    [req.user.uid]
  )

  res.json({ user, roles, location: locations[0] || null })
})

app.put('/user/profile', authRequired, async (req, res) => {
  const body = req.body || {}
  const nickname = String(body.nickname ?? '').trim() || null
  const avatarUrl = String(body.avatarUrl ?? body.avatar_url ?? '').trim() || null
  const bio = String(body.bio ?? '').trim() || null
  const gender = String(body.gender ?? '').trim() || null

  await pool.query(
    'UPDATE users SET nickname=?, avatar_url=?, bio=?, gender=? WHERE id=?',
    [nickname, avatarUrl, bio, gender, req.user.uid]
  )
  res.json({ ok: true })
})

app.post('/interactions', authRequired, async (req, res) => {
  const { toUserId, message } = req.body || {}
  const toId = Number(toUserId)
  if (!Number.isFinite(toId) || toId <= 0) return res.status(400).json({ message: 'toUserId 无效' })
  if (toId === Number(req.user.uid)) return res.status(400).json({ message: '不能向自己发起互动' })

  await pool.query(
    'INSERT INTO interactions (from_user_id, to_user_id, message) VALUES (?, ?, ?)',
    [req.user.uid, toId, String(message || '').trim() || null]
  )
  res.json({ ok: true })
})

app.get('/interactions/my', authRequired, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT i.id, i.from_user_id fromUserId, i.to_user_id toUserId, i.message, i.status, i.created_at createdAt,
            uf.nickname fromNickname, ut.nickname toNickname
     FROM interactions i
     LEFT JOIN users uf ON uf.id = i.from_user_id
     LEFT JOIN users ut ON ut.id = i.to_user_id
     WHERE i.from_user_id=? OR i.to_user_id=?
     ORDER BY i.created_at DESC
     LIMIT 100`,
    [req.user.uid, req.user.uid]
  )
  res.json(rows)
})

app.get('/map/nearby', authRequired, async (req, res) => {
  const { roleCode } = req.query
  const [rows] = await pool.query(
    `SELECT u.id, u.nickname, u.avatar_url avatarUrl, u.bio, u.gender,
            r.code roleCode, r.name roleName, ul.lat, ul.lng, ul.updated_at
     FROM user_locations ul
     JOIN users u ON u.id = ul.user_id
     LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.is_primary = 1
     LEFT JOIN roles r ON r.id = ur.role_id
     WHERE ul.is_online = 1 AND (? IS NULL OR r.code = ?)
     ORDER BY ul.updated_at DESC
     LIMIT 200`,
    [roleCode || null, roleCode || null]
  )
  res.json(rows)
})

const port = Number(process.env.PORT || 3000)
ensureSchema()
  .then(() => {
    app.listen(port, () => console.log(`sharele backend running at http://localhost:${port}`))
  })
  .catch((err) => {
    console.error('schema init failed', err)
    process.exit(1)
  })
