import jwt from 'jsonwebtoken'

export function authRequired(req, res, next) {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return res.status(401).json({ message: '未登录' })
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret')
    next()
  } catch {
    res.status(401).json({ message: 'token 无效或过期' })
  }
}
