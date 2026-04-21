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
  const { realName, idCardNo } = req.body || {}
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
    `SELECT id, phone, nickname, real_name realName, verify_status verifyStatus
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

app.get('/map/nearby', authRequired, async (req, res) => {
  const { roleCode } = req.query
  const [rows] = await pool.query(
    `SELECT u.id, u.nickname, r.code roleCode, r.name roleName, ul.lat, ul.lng, ul.updated_at
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
app.listen(port, () => console.log(`sharele backend running at http://localhost:${port}`))
