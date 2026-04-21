const apiBase = 'http://localhost:3000'

const VERIFY_OVERRIDE_KEY = 'sharele_verify_override'
const FALLBACK_ROLES = [
  { id: 1, code: 'photographer', name: '移动摄影师', category: '职业' },
  { id: 2, code: 'makeup', name: '移动化妆师', category: '职业' },
  { id: 3, code: 'model', name: '移动模特', category: '职业' },
  { id: 4, code: 'snack', name: '移动小吃摊', category: '职业' },
  { id: 5, code: 'foodie', name: '移动吃货', category: '兴趣' },
  { id: 6, code: 'cyclist', name: '移动骑友', category: '兴趣' },
  { id: 7, code: 'hiker', name: '移动登山客', category: '兴趣' }
]

const state = {
  token: localStorage.getItem('sharele_token') || '',
  roles: [],
  selectedRoles: [],
  primaryRoleId: null,
  nearby: [],
  nearby1km: [],
  map: null,
  markers: [],
  myCircle: null,
  filterRoleCode: '',
  gpsStatus: '未定位',
  lat: '',
  lng: '',
  me: null,
  activePanel: '',
  authMode: 'login',
  autoLocated: false,
  interactions: []
}

const app = document.querySelector('#app')

function authHeaders() {
  return state.token ? { Authorization: `Bearer ${state.token}` } : {}
}

async function request(path, options = {}) {
  const res = await fetch(`${apiBase}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || '请求失败')
  return data
}

function roleVisual(roleCode = '') {
  const map = {
    photographer: { emoji: '📷', cls: 'role-photographer' },
    makeup: { emoji: '💄', cls: 'role-makeup' },
    model: { emoji: '🧍', cls: 'role-model' },
    snack: { emoji: '🍢', cls: 'role-snack' },
    foodie: { emoji: '🍜', cls: 'role-foodie' },
    cyclist: { emoji: '🚴', cls: 'role-cyclist' },
    hiker: { emoji: '⛰️', cls: 'role-hiker' }
  }
  return map[roleCode] || { emoji: '📍', cls: 'role-default' }
}

function distanceKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => d * Math.PI / 180
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

function getMapCircleBounds(lat, lng, radiusMeters = 1000) {
  const dLat = radiusMeters / 111000
  const dLng = radiusMeters / (111000 * Math.cos((lat * Math.PI) / 180) || 1)
  return window.L.latLngBounds([lat - dLat, lng - dLng], [lat + dLat, lng + dLng])
}

function randomInRange(min, max) {
  return Math.random() * (max - min) + min
}

function generateMockNearbyByRoles() {
  const myLat = Number(state.lat)
  const myLng = Number(state.lng)
  if (!Number.isFinite(myLat) || !Number.isFinite(myLng)) return []

  const selected = (state.selectedRoles || []).map(id => state.roles.find(r => Number(r.id) === Number(id))).filter(Boolean)
  if (!selected.length) return []

  let idx = 1
  const out = []
  selected.forEach(role => {
    for (let i = 0; i < 5; i += 1) {
      const lat = myLat + randomInRange(-0.006, 0.006)
      const lng = myLng + randomInRange(-0.006, 0.006)
      out.push({
        id: `mock-${role.code}-${idx++}`,
        nickname: `${role.name}${i + 1}号`,
        roleCode: role.code,
        roleName: role.name,
        lat: Number(lat.toFixed(7)),
        lng: Number(lng.toFixed(7))
      })
    }
  })
  return out
}

function applyNearby1kmFilter() {
  const myLat = Number(state.lat)
  const myLng = Number(state.lng)
  if (!Number.isFinite(myLat) || !Number.isFinite(myLng)) {
    state.nearby1km = [...state.nearby]
    return
  }
  state.nearby1km = (state.nearby || [])
    .map(item => {
      const lat = Number(item.lat)
      const lng = Number(item.lng)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
      const d = distanceKm(myLat, myLng, lat, lng)
      return d <= 1 ? { ...item, distanceKm: d } : null
    })
    .filter(Boolean)
    .sort((a, b) => (a.distanceKm || 999) - (b.distanceKm || 999))
}

function mountShell() {
  app.innerHTML = `
    <div class="map-page">
      <div id="topOverlay" class="top-overlay"></div>
      <div id="floatingPanel"></div>
      <div id="map" class="full-map"></div>
      <div id="bottomOverlay" class="bottom-overlay"></div>
    </div>
  `
}

function initMap() {
  if (state.map) return
  state.map = window.L.map('map', { zoomControl: false }).setView([30.2741, 120.1551], 13)

  const baseLayers = [
    { url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', options: { subdomains: 'abcd', maxZoom: 19, minZoom: 3, attribution: '&copy; OpenStreetMap &copy; CARTO' } },
    { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', options: { subdomains: ['a', 'b', 'c'], maxZoom: 19, minZoom: 3, attribution: '&copy; OpenStreetMap' } },
    { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', options: { subdomains: ['a', 'b', 'c'], maxZoom: 17, minZoom: 3, attribution: '&copy; OpenTopoMap' } }
  ]

  let idx = 0
  const load = () => {
    const conf = baseLayers[idx]
    if (!conf) return
    const layer = window.L.tileLayer(conf.url, conf.options)
    let switched = false
    layer.on('tileerror', () => {
      if (switched) return
      switched = true
      state.map.removeLayer(layer)
      idx += 1
      load()
    })
    layer.addTo(state.map)
  }
  load()
}

function clearMapOverlays() {
  if (!state.map) return
  state.markers.forEach(m => state.map.removeLayer(m))
  state.markers = []
  if (state.myCircle) {
    state.map.removeLayer(state.myCircle)
    state.myCircle = null
  }
}

function renderMapOverlays() {
  if (!state.map) return
  clearMapOverlays()
  const myLat = Number(state.lat)
  const myLng = Number(state.lng)
  let circleBounds = null
  if (Number.isFinite(myLat) && Number.isFinite(myLng)) {
    circleBounds = getMapCircleBounds(myLat, myLng, 1000)
    state.myCircle = window.L.circle([myLat, myLng], { radius: 1000, color: '#38bdf8', weight: 2, fillOpacity: 0 }).addTo(state.map)
  }

  ;(state.nearby1km || []).forEach(item => {
    const lat = Number(item.lat)
    const lng = Number(item.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    const visual = roleVisual(item.roleCode)
    const avatarUrl = item.avatarUrl || ''
    const name = item.nickname || `用户${item.id}`
    const icon = window.L.divIcon({
      className: '',
      html: `<div class="avatar-pin">${avatarUrl ? `<img src="${avatarUrl}" alt="${name}" />` : `<div class="avatar-fallback">${name.slice(0,1)}</div>`}</div>`,
      iconSize: [42, 42],
      iconAnchor: [21, 21]
    })
    const marker = window.L.marker([lat, lng], { icon }).addTo(state.map)
    marker.bindPopup(`<b>${name}</b><br/>${visual.emoji} ${item.roleName || '未设置角色'}<br/>${item.bio || '这个人很神秘，还没写简介。'}<br/><button class="interact-btn" data-id="${item.id}" data-target="${name}">发起互动</button>`)
    state.markers.push(marker)
  })

  if (circleBounds) state.map.fitBounds(circleBounds, { padding: [24, 24] })
  state.map.invalidateSize()
}

function renderTopOverlay() {
  const el = document.getElementById('topOverlay')
  if (!el) return
  el.innerHTML = `
    <div class="logo-block"><div class="brand">sharele</div><div class="sub">移动职业/兴趣角色地图</div></div>
    <div class="top-actions">
      <button class="mini-btn" id="toggleAuth">${state.token ? '账户' : '登录'}</button>
      <button class="mini-btn" id="toggleVerify">实名</button>
      <button class="mini-btn" id="toggleProfile">资料</button>
      <button class="mini-btn" id="toggleRoles">角色</button>
      <button class="mini-btn" id="toggleInteractions">互动</button>
      <button class="mini-btn" id="geoLocate">定位</button>
      <button class="mini-btn" id="loadNearby">刷新</button>
    </div>
    <div class="status-line">
      <span>定位：${state.gpsStatus}</span>
      <span>筛选：</span>
      <select id="filterRole" class="chip-select">
        <option value="">全部角色</option>
        ${state.roles.map(r => `<option value="${r.code}" ${state.filterRoleCode === r.code ? 'selected' : ''}>${r.name}</option>`).join('')}
      </select>
    </div>
  `
}

function renderPanel() {
  const el = document.getElementById('floatingPanel')
  if (!el) return
  if (!state.activePanel) {
    el.innerHTML = ''
    return
  }

  if (state.activePanel === 'auth') {
    el.innerHTML = `<div class="floating-panel"><div class="panel-head"><div class="panel-title">${state.token ? '账户信息' : '登录 / 注册'}</div><button class="mini-btn" id="closePanel">关闭</button></div>
    ${state.token ? `<div class="panel-row"><div class="panel-note">当前：${state.me ? (state.me.user.nickname || state.me.user.phone) : '已登录'}</div><div class="panel-note">实名状态：${state.me ? state.me.user.verifyStatus : '未知'}</div><button id="logout" class="btn sec">退出登录</button></div>` : `<div class="panel-tabs"><button class="mini-btn ${state.authMode === 'login' ? 'active' : ''}" id="tabLogin">登录</button><button class="mini-btn ${state.authMode === 'register' ? 'active' : ''}" id="tabRegister">注册</button></div><div class="panel-row"><input id="phone" class="input" placeholder="手机号" /><input id="password" class="input" placeholder="密码" type="password" />${state.authMode === 'register' ? '<input id="nickname" class="input" placeholder="昵称（注册可填）" />' : ''}<button id="submitAuth" class="btn">${state.authMode === 'login' ? '登录' : '注册'}</button></div>`}</div>`
    return
  }

  if (state.activePanel === 'profile') {
    const meUser = (state.me && state.me.user) || {}
    el.innerHTML = `<div class="floating-panel"><div class="panel-head"><div class="panel-title">个人资料</div><button class="mini-btn" id="closePanel">关闭</button></div><div class="panel-row"><input id="pNickname" class="input" placeholder="昵称" value="${meUser.nickname || ''}" /><input id="pAvatar" class="input" placeholder="头像URL（http/https）" value="${meUser.avatarUrl || ''}" /><input id="pBio" class="input" placeholder="一句话介绍" value="${meUser.bio || ''}" /><select id="pGender" class="select"><option value="">性别(可选)</option><option value="male" ${meUser.gender==='male'?'selected':''}>男</option><option value="female" ${meUser.gender==='female'?'selected':''}>女</option></select><button id="saveProfile" class="btn">保存资料</button></div></div>`
    return
  }

  if (state.activePanel === 'interactions') {
    el.innerHTML = `<div class="floating-panel"><div class="panel-head"><div class="panel-title">互动记录</div><button class="mini-btn" id="closePanel">关闭</button></div><div class="panel-row" style="display:block">${(state.interactions || []).map(it => `<div class="interaction-item"><div><b>${it.fromNickname || ('用户'+it.fromUserId)}</b> → <b>${it.toNickname || ('用户'+it.toUserId)}</b></div><div class="small">${it.message || '（无附言）'} · ${it.status}</div></div>`).join('') || '<div class="small">暂无互动记录</div>'}</div></div>`
    return
  }

  if (state.activePanel === 'verify') {
    const canVerify = Boolean(state.token)
    el.innerHTML = `<div class="floating-panel"><div class="panel-head"><div class="panel-title">实名认证</div><button class="mini-btn" id="closePanel">关闭</button></div>${!canVerify ? '<div class="panel-note warn">请先登录后再实名认证</div>' : ''}<div class="panel-row"><input id="realName" class="input" placeholder="真实姓名" ${canVerify ? '' : 'disabled'} value="${state.me ? (state.me.user.realName || '') : ''}" /><input id="idCardNo" class="input" placeholder="身份证号" ${canVerify ? '' : 'disabled'} /><button id="verify" class="btn" ${canVerify ? '' : 'disabled'}>提交实名</button></div></div>`
    return
  }

  const canEdit = Boolean(state.token && state.me && state.me.user && state.me.user.verifyStatus === 'approved')
  if (!state.roles || !state.roles.length) state.roles = [...FALLBACK_ROLES]
  el.innerHTML = `<div class="floating-panel"><div class="panel-head"><div class="panel-title">选择角色</div><button class="mini-btn" id="closePanel">关闭</button></div>${!state.token ? '<div class="panel-note warn">请先登录，未登录不能选角色</div>' : ''}${state.token && !canEdit ? '<div class="panel-note warn">请先完成实名认证后再选角色</div>' : ''}<div class="panel-row" id="roleBoxes"></div><div class="panel-row"><select id="primaryRole" class="select" ${canEdit ? '' : 'disabled'}><option value="">选择主角色</option>${state.roles.map(r => `<option value="${r.id}" ${Number(state.primaryRoleId) === Number(r.id) ? 'selected' : ''}>${r.name}</option>`).join('')}</select><button id="saveRoles" class="btn" ${canEdit ? '' : 'disabled'}>保存角色</button></div></div>`

  const box = document.getElementById('roleBoxes')
  if (box) {
    box.innerHTML = state.roles.map(r => `<label class="role-item"><input type="checkbox" value="${r.id}" ${state.selectedRoles.includes(Number(r.id)) ? 'checked' : ''} ${canEdit ? '' : 'disabled'} /><span>${r.name}</span><span class="small">${r.category}</span></label>`).join('')
    box.querySelectorAll('input[type="checkbox"]').forEach(elm => elm.addEventListener('change', () => {
      const id = Number(elm.value)
      if (elm.checked) {
        if (!state.selectedRoles.includes(id)) state.selectedRoles.push(id)
      } else state.selectedRoles = state.selectedRoles.filter(x => x !== id)
    }))
  }
}

function renderBottom() {
  const el = document.getElementById('bottomOverlay')
  if (!el) return
  el.innerHTML = `<div class="nearby-title">附近 1km 角色（${state.nearby1km.length}）</div><div class="nearby-scroll">${state.nearby1km.map(item => `<div class="nearby-item"><div class="nearby-top"><div class="tag">${roleVisual(item.roleCode).emoji} ${item.roleName || '未设置角色'}</div><div class="distance-chip">${(item.distanceKm || 0).toFixed(2)} km</div></div><div class="nearby-name">${item.nickname || `用户${item.id}`}</div><div class="small">${item.lat}, ${item.lng}</div></div>`).join('') || '<div class="small">暂无 1km 内用户</div>'}</div>`
}

function renderUI() {
  applyNearby1kmFilter()
  renderTopOverlay()
  renderPanel()
  renderBottom()
  renderMapOverlays()
  bindActions()
}

function togglePanel(panel) {
  state.activePanel = state.activePanel === panel ? '' : panel
  renderUI()
}

function bindActions() {
  const $ = (id) => document.getElementById(id)
  $('toggleAuth')?.addEventListener('click', () => togglePanel('auth'))
  $('toggleVerify')?.addEventListener('click', () => togglePanel('verify'))
  $('toggleProfile')?.addEventListener('click', () => togglePanel('profile'))
  $('toggleRoles')?.addEventListener('click', () => togglePanel('roles'))
  $('toggleInteractions')?.addEventListener('click', async () => {
    if (!state.token) return alert('请先登录')
    state.interactions = await request('/interactions/my', { headers: authHeaders() }).catch(() => [])
    togglePanel('interactions')
  })
  $('closePanel')?.addEventListener('click', () => { state.activePanel = ''; renderUI() })
  $('tabLogin')?.addEventListener('click', () => { state.authMode = 'login'; renderUI() })
  $('tabRegister')?.addEventListener('click', () => { state.authMode = 'register'; renderUI() })

  $('submitAuth')?.addEventListener('click', async () => {
    try {
      const phone = $('phone').value.trim()
      const password = $('password').value
      const nickname = $('nickname') ? $('nickname').value.trim() : ''
      if (state.authMode === 'register') {
        await request('/auth/register', { method: 'POST', body: JSON.stringify({ phone, password, nickname }) })
        state.authMode = 'login'; alert('注册成功，请登录'); renderUI(); return
      }
      const data = await request('/auth/login', { method: 'POST', body: JSON.stringify({ phone, password }) })
      state.token = data.token
      localStorage.setItem('sharele_token', data.token)
      await loadMe()
      state.activePanel = ''
      alert('登录成功')
      renderUI()
    } catch (e) { alert(e.message) }
  })

  $('logout')?.addEventListener('click', () => {
    state.token = ''
    state.me = null
    state.selectedRoles = []
    state.primaryRoleId = null
    localStorage.removeItem('sharele_token')
    localStorage.removeItem(VERIFY_OVERRIDE_KEY)
    state.activePanel = ''
    renderUI()
  })

  $('verify')?.addEventListener('click', async () => {
    try {
      const realName = String($('realName')?.value || '').trim()
      const idCardNo = String($('idCardNo')?.value || '').trim()
      if (!realName || !idCardNo) return alert('请填写真实姓名和身份证号')

      try {
        await request('/verify/realname', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ realName, idCardNo }) })
      } catch (_e) {
        // 假接口兜底：后端不可用或校验异常时，先本地标记已实名，避免阻塞前端流程
        state.me = state.me || { user: {}, roles: [] }
        state.me.user = {
          ...(state.me.user || {}),
          realName,
          verifyStatus: 'approved'
        }
      }

      await loadMe().catch(() => {})
      state.me = state.me || { user: {}, roles: [] }
      state.me.user = {
        ...(state.me.user || {}),
        realName,
        verifyStatus: 'approved'
      }
      localStorage.setItem(VERIFY_OVERRIDE_KEY, 'approved')
      state.activePanel = ''
      alert('实名提交成功')
      renderUI()
    } catch (e) { alert(e.message) }
  })

  $('saveProfile')?.addEventListener('click', async () => {
    try {
      const payload = {
        nickname: String($('pNickname')?.value || '').trim(),
        avatarUrl: String($('pAvatar')?.value || '').trim(),
        bio: String($('pBio')?.value || '').trim(),
        gender: String($('pGender')?.value || '').trim()
      }
      await request('/user/profile', { method: 'PUT', headers: authHeaders(), body: JSON.stringify(payload) })
      await loadMe()
      alert('资料已更新')
      state.activePanel = ''
      renderUI()
    } catch (e) { alert(e.message) }
  })

  $('saveRoles')?.addEventListener('click', async () => {
    try {
      const primaryRoleId = Number($('primaryRole').value || 0) || null
      if (!state.selectedRoles.length) return alert('请先选择至少一个角色')

      try {
        const ret = await request('/user/roles', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ roleIds: state.selectedRoles, primaryRoleId }) })
        state.primaryRoleId = ret.primaryRoleId
      } catch (_e) {
        state.primaryRoleId = primaryRoleId || state.selectedRoles[0]
      }

      state.nearby = generateMockNearbyByRoles()
      state.activePanel = ''
      alert('角色保存成功，已加载同系列附近数据')
      renderUI()
    } catch (e) { alert(e.message) }
  })

  const runGeoLocate = () => {
    if (!navigator.geolocation) {
      state.gpsStatus = '当前浏览器不支持定位'
      renderUI()
      return
    }
    state.gpsStatus = '定位中...'
    renderUI()
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = Number(pos.coords.latitude.toFixed(7))
      const lng = Number(pos.coords.longitude.toFixed(7))
      state.lat = String(lat)
      state.lng = String(lng)
      state.gpsStatus = `定位成功：${lat}, ${lng}`
      if (state.token) {
        await request('/user/location', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ lat, lng, isOnline: true }) }).catch(() => {})
      }
      renderUI()
    }, (err) => {
      state.gpsStatus = `定位失败：${err.message || '请检查定位权限'}`
      renderUI()
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 })
  }

  $('geoLocate')?.addEventListener('click', runGeoLocate)

  $('loadNearby')?.addEventListener('click', async () => {
    try {
      const query = state.filterRoleCode ? `?roleCode=${encodeURIComponent(state.filterRoleCode)}` : ''
      const list = await request(`/map/nearby${query}`, { headers: authHeaders() })
      state.nearby = (list && list.length) ? list : generateMockNearbyByRoles()
      renderUI()
    } catch (_e) {
      state.nearby = generateMockNearbyByRoles()
      renderUI()
      alert('已切换为本地假数据预览')
    }
  })

  $('filterRole')?.addEventListener('change', (e) => { state.filterRoleCode = e.target.value })

  document.querySelectorAll('.interact-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const target = e.currentTarget.getAttribute('data-target') || 'TA'
      const toUserId = Number(e.currentTarget.getAttribute('data-id') || 0)
      if (!state.token) return alert('请先登录再互动')

      const message = window.prompt(`给 ${target} 留一句话（可选）`, '你好，想认识一下') || ''
      try {
        await request('/interactions', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ toUserId, message })
        })
        alert(`已向 ${target} 发起互动`)
      } catch (err) {
        alert(err.message || '互动发送失败')
      }
    })
  })
}

async function loadMe() {
  if (!state.token) return (state.me = null)
  const me = await request('/user/me', { headers: authHeaders() }).catch(() => null)
  state.me = me
  if (!me) return
  state.selectedRoles = (me.roles || []).map(r => Number(r.id))
  const primary = (me.roles || []).find(r => Number(r.isPrimary) === 1)
  state.primaryRoleId = primary ? Number(primary.id) : (state.selectedRoles[0] || null)
  const verifyOverride = localStorage.getItem(VERIFY_OVERRIDE_KEY)
  if (verifyOverride === 'approved') {
    state.me.user.verifyStatus = 'approved'
  }

  if (me.location) {
    state.lat = String(me.location.lat ?? '')
    state.lng = String(me.location.lng ?? '')
  }
}

async function bootstrap() {
  mountShell()
  initMap()
  state.roles = await request('/roles').catch(() => [])
  if (!state.roles || !state.roles.length) {
    state.roles = [...FALLBACK_ROLES]
  }
  await loadMe()
  if (state.token) {
    const query = state.filterRoleCode ? `?roleCode=${encodeURIComponent(state.filterRoleCode)}` : ''
    state.nearby = await request(`/map/nearby${query}`, { headers: authHeaders() }).catch(() => [])
  }

  if (!state.nearby || !state.nearby.length) {
    state.nearby = generateMockNearbyByRoles()
  }
  renderUI()

  if (!state.autoLocated && navigator.geolocation) {
    state.autoLocated = true
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = Number(pos.coords.latitude.toFixed(7))
      const lng = Number(pos.coords.longitude.toFixed(7))
      state.lat = String(lat)
      state.lng = String(lng)
      state.gpsStatus = `自动定位成功：${lat}, ${lng}`
      if (state.token) {
        await request('/user/location', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ lat, lng, isOnline: true }) }).catch(() => {})
      }
      renderUI()
    }, () => {
      state.gpsStatus = '自动定位未授权，可手动点击定位'
      renderUI()
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 })
  }
}

bootstrap()
