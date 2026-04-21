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
  interactions: [],
  autoLocated: false,
  activeTab: 'nearby',
  sheetOpen: true,
  authMode: 'login'
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
        bio: `我是${role.name}，可随时接单/互动。`,
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
      <div id="topBar" class="top-bar"></div>
      <div id="map" class="full-map"></div>
      <div id="sheet" class="bottom-sheet"></div>
      <div id="tabbar" class="tabbar"></div>
    </div>
  `
}

function initMap() {
  if (state.map) return
  state.map = window.L.map('map', { zoomControl: false }).setView([30.2741, 120.1551], 13)
  const layers = [
    { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', options: { subdomains: 'abcd', maxZoom: 19, minZoom: 3, attribution: '&copy; CARTO' } },
    { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', options: { subdomains: ['a', 'b', 'c'], maxZoom: 19, minZoom: 3, attribution: '&copy; OpenStreetMap' } }
  ]
  let idx = 0
  const load = () => {
    const conf = layers[idx]
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
  if (Number.isFinite(myLat) && Number.isFinite(myLng)) {
    const circleBounds = getMapCircleBounds(myLat, myLng, 1000)
    state.myCircle = window.L.circle([myLat, myLng], { radius: 1000, color: '#38bdf8', weight: 1.5, fillOpacity: 0 }).addTo(state.map)
    state.map.fitBounds(circleBounds, { padding: [32, 32] })
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
      iconSize: [44, 44],
      iconAnchor: [22, 22]
    })
    const marker = window.L.marker([lat, lng], { icon }).addTo(state.map)
    marker.bindPopup(`<b>${name}</b><br/>${visual.emoji} ${item.roleName || '未设置角色'}<br/>${item.bio || '这个人很神秘，还没写简介。'}<br/><button class="interact-btn" data-id="${item.id}" data-target="${name}">发起互动</button>`)
    state.markers.push(marker)
  })
  state.map.invalidateSize()
}

function renderTopBar() {
  const el = document.getElementById('topBar')
  if (!el) return
  const meUser = (state.me && state.me.user) || {}
  el.innerHTML = `
    <div class="brand-chip">
      <div class="brand">sharele</div>
      <div class="sub">移动职业/兴趣角色地图</div>
    </div>
    <div class="top-right">
      <div class="gps-chip">${state.gpsStatus}</div>
      <button class="avatar-entry" id="openMy">${meUser.avatarUrl ? `<img src="${meUser.avatarUrl}" alt="me" />` : `<span>${(meUser.nickname || '我').slice(0,1)}</span>`}</button>
    </div>
  `
}

function renderSheet() {
  const el = document.getElementById('sheet')
  if (!el) return
  const meUser = (state.me && state.me.user) || {}
  const canEditRoles = Boolean(state.token && meUser.verifyStatus === 'approved')

  let content = ''
  if (state.activeTab === 'nearby') {
    content = `
      <div class="sheet-head"><div><div class="sheet-title">附近 1km</div><div class="sheet-sub">地图是主角，列表只是辅助筛选。</div></div><select id="filterRole" class="sheet-select"><option value="">全部角色</option>${state.roles.map(r => `<option value="${r.code}" ${state.filterRoleCode === r.code ? 'selected' : ''}>${r.name}</option>`).join('')}</select></div>
      <div class="nearby-list">${state.nearby1km.map(item => `<div class="nearby-row"><div><div class="nearby-name">${item.nickname || `用户${item.id}`}</div><div class="small">${item.roleName || '未设置角色'} · ${(item.distanceKm || 0).toFixed(2)} km</div></div><button class="ghost-btn interact-inline" data-id="${item.id}" data-target="${item.nickname || `用户${item.id}`}">互动</button></div>`).join('') || '<div class="small">暂无 1km 内用户</div>'}</div>
    `
  } else if (state.activeTab === 'roles') {
    content = `
      <div class="sheet-head"><div><div class="sheet-title">角色选择</div><div class="sheet-sub">先选你的身份，地图就显示同系列人群。</div></div></div>
      ${!state.token ? '<div class="warn-line">请先登录</div>' : ''}
      ${state.token && !canEditRoles ? '<div class="warn-line">请先在“我的”里完成实名认证</div>' : ''}
      <div id="roleBoxes" class="role-grid"></div>
      <div class="role-actions"><select id="primaryRole" class="sheet-select" ${canEditRoles ? '' : 'disabled'}><option value="">选择主角色</option>${state.roles.map(r => `<option value="${r.id}" ${Number(state.primaryRoleId)===Number(r.id)?'selected':''}>${r.name}</option>`).join('')}</select><button id="saveRoles" class="primary-btn" ${canEditRoles ? '' : 'disabled'}>保存并显示</button></div>
    `
  } else if (state.activeTab === 'interactions') {
    content = `
      <div class="sheet-head"><div><div class="sheet-title">互动记录</div><div class="sheet-sub">你发起过的联系和收到的联系。</div></div></div>
      <div class="nearby-list">${(state.interactions || []).map(it => `<div class="nearby-row"><div><div class="nearby-name">${it.fromNickname || ('用户'+it.fromUserId)} → ${it.toNickname || ('用户'+it.toUserId)}</div><div class="small">${it.message || '（无附言）'} · ${it.status}</div></div></div>`).join('') || '<div class="small">暂无互动记录</div>'}</div>
    `
  } else {
    content = `
      <div class="sheet-head"><div><div class="sheet-title">我的</div><div class="sheet-sub">账户、实名、资料都放这里。</div></div></div>
      ${state.token ? `
        <div class="account-card">
          <div class="account-main">
            <div class="account-avatar">${meUser.avatarUrl ? `<img src="${meUser.avatarUrl}" alt="me" />` : `<span>${(meUser.nickname || '我').slice(0,1)}</span>`}</div>
            <div><div class="nearby-name">${meUser.nickname || meUser.phone || '未登录用户'}</div><div class="small">实名状态：${meUser.verifyStatus || '未知'}</div></div>
          </div>
          <div class="account-actions">
            <button class="ghost-btn" id="openVerify">实名认证</button>
            <button class="ghost-btn" id="openProfile">资料设置</button>
            <button class="ghost-btn" id="logout">退出登录</button>
          </div>
        </div>
      ` : `
        <div class="login-card">
          <div class="tab-mini"><button class="ghost-btn ${state.authMode==='login'?'active':''}" id="tabLogin">登录</button><button class="ghost-btn ${state.authMode==='register'?'active':''}" id="tabRegister">注册</button></div>
          <div class="form-grid"><input id="phone" class="sheet-input" placeholder="手机号" /><input id="password" class="sheet-input" placeholder="密码" type="password" />${state.authMode === 'register' ? '<input id="nickname" class="sheet-input" placeholder="昵称（注册可填）" />' : ''}<button id="submitAuth" class="primary-btn">${state.authMode === 'login' ? '登录' : '注册'}</button></div>
        </div>
      `}
      <div id="subPanel"></div>
    `
  }

  el.className = `bottom-sheet ${state.sheetOpen ? 'open' : ''}`
  el.innerHTML = `<div class="sheet-handle" id="toggleSheet"></div><div class="sheet-content">${content}</div>`

  if (state.activeTab === 'roles') {
    const box = document.getElementById('roleBoxes')
    const canEdit = canEditRoles
    if (box) {
      box.innerHTML = state.roles.map(r => `<label class="role-card"><input type="checkbox" value="${r.id}" ${state.selectedRoles.includes(Number(r.id)) ? 'checked' : ''} ${canEdit ? '' : 'disabled'} /><span>${r.name}</span><small>${r.category}</small></label>`).join('')
      box.querySelectorAll('input[type="checkbox"]').forEach(elm => elm.addEventListener('change', () => {
        const id = Number(elm.value)
        if (elm.checked) {
          if (!state.selectedRoles.includes(id)) state.selectedRoles.push(id)
        } else state.selectedRoles = state.selectedRoles.filter(x => x !== id)
      }))
    }
  }
}

function renderTabbar() {
  const el = document.getElementById('tabbar')
  if (!el) return
  const tabs = [
    { key: 'nearby', label: '附近', icon: '🧭' },
    { key: 'roles', label: '角色', icon: '🏷️' },
    { key: 'interactions', label: '互动', icon: '💬' },
    { key: 'my', label: '我的', icon: '👤' }
  ]
  el.innerHTML = tabs.map(tab => `<button class="tab-btn ${state.activeTab===tab.key?'active':''}" data-tab="${tab.key}"><span>${tab.icon}</span><em>${tab.label}</em></button>`).join('')
}

function renderUI() {
  applyNearby1kmFilter()
  renderTopBar()
  renderSheet()
  renderTabbar()
  renderMapOverlays()
  bindActions()
}

function bindActions() {
  const $ = (id) => document.getElementById(id)

  $('toggleSheet')?.addEventListener('click', () => {
    state.sheetOpen = !state.sheetOpen
    renderUI()
  })

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tab = btn.getAttribute('data-tab')
      state.activeTab = tab
      state.sheetOpen = true
      if (tab === 'interactions' && state.token) {
        state.interactions = await request('/interactions/my', { headers: authHeaders() }).catch(() => [])
      }
      renderUI()
    })
  })

  $('openMy')?.addEventListener('click', () => {
    state.activeTab = 'my'
    state.sheetOpen = true
    renderUI()
  })

  $('tabLogin')?.addEventListener('click', () => { state.authMode = 'login'; renderUI() })
  $('tabRegister')?.addEventListener('click', () => { state.authMode = 'register'; renderUI() })

  $('submitAuth')?.addEventListener('click', async () => {
    try {
      const phone = $('phone').value.trim()
      const password = $('password').value
      const nickname = $('nickname') ? $('nickname').value.trim() : ''
      if (state.authMode === 'register') {
        await request('/auth/register', { method: 'POST', body: JSON.stringify({ phone, password, nickname }) })
        state.authMode = 'login'
        alert('注册成功，请登录')
        renderUI()
        return
      }
      const data = await request('/auth/login', { method: 'POST', body: JSON.stringify({ phone, password }) })
      state.token = data.token
      localStorage.setItem('sharele_token', data.token)
      await loadMe()
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
    renderUI()
  })

  $('openVerify')?.addEventListener('click', () => {
    const host = document.getElementById('subPanel')
    if (host) host.innerHTML = `<div class="sub-card"><div class="sheet-title">实名认证</div><div class="form-grid"><input id="realName" class="sheet-input" placeholder="真实姓名" value="${state.me?.user?.realName || ''}" /><input id="idCardNo" class="sheet-input" placeholder="身份证号" /><button id="verify" class="primary-btn">提交实名</button></div></div>`
    bindActions()
  })

  $('openProfile')?.addEventListener('click', () => {
    const meUser = (state.me && state.me.user) || {}
    const host = document.getElementById('subPanel')
    if (host) host.innerHTML = `<div class="sub-card"><div class="sheet-title">资料设置</div><div class="form-grid"><input id="pNickname" class="sheet-input" placeholder="昵称" value="${meUser.nickname || ''}" /><input id="pAvatar" class="sheet-input" placeholder="头像URL（http/https）" value="${meUser.avatarUrl || ''}" /><input id="pBio" class="sheet-input" placeholder="一句话介绍" value="${meUser.bio || ''}" /><select id="pGender" class="sheet-select"><option value="">性别(可选)</option><option value="male" ${meUser.gender==='male'?'selected':''}>男</option><option value="female" ${meUser.gender==='female'?'selected':''}>女</option></select><button id="saveProfile" class="primary-btn">保存资料</button></div></div>`
    bindActions()
  })

  $('verify')?.addEventListener('click', async () => {
    try {
      const realName = String($('realName')?.value || '').trim()
      const idCardNo = String($('idCardNo')?.value || '').trim()
      if (!realName || !idCardNo) return alert('请填写真实姓名和身份证号')
      try {
        await request('/verify/realname', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ realName, idCardNo }) })
      } catch (_) {}
      await loadMe().catch(() => {})
      state.me = state.me || { user: {}, roles: [] }
      state.me.user = { ...(state.me.user || {}), realName, verifyStatus: 'approved' }
      localStorage.setItem(VERIFY_OVERRIDE_KEY, 'approved')
      renderUI()
      alert('实名提交成功')
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
      renderUI()
      alert('资料已更新')
    } catch (e) { alert(e.message) }
  })

  $('saveRoles')?.addEventListener('click', async () => {
    try {
      const primaryRoleId = Number($('primaryRole').value || 0) || null
      if (!state.selectedRoles.length) return alert('请先选择至少一个角色')
      try {
        const ret = await request('/user/roles', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ roleIds: state.selectedRoles, primaryRoleId }) })
        state.primaryRoleId = ret.primaryRoleId
      } catch (_) {
        state.primaryRoleId = primaryRoleId || state.selectedRoles[0]
      }
      state.nearby = generateMockNearbyByRoles()
      state.activeTab = 'nearby'
      renderUI()
    } catch (e) { alert(e.message) }
  })

  $('filterRole')?.addEventListener('change', async (e) => {
    state.filterRoleCode = e.target.value
    const query = state.filterRoleCode ? `?roleCode=${encodeURIComponent(state.filterRoleCode)}` : ''
    state.nearby = await request(`/map/nearby${query}`, { headers: authHeaders() }).catch(() => generateMockNearbyByRoles())
    renderUI()
  })

  document.querySelectorAll('.interact-btn, .interact-inline').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const target = e.currentTarget.getAttribute('data-target') || 'TA'
      const toUserId = Number(e.currentTarget.getAttribute('data-id') || 0)
      if (!state.token) return alert('请先登录再互动')
      const message = window.prompt(`给 ${target} 留一句话（可选）`, '你好，想认识一下') || ''
      try {
        await request('/interactions', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ toUserId, message }) })
        alert(`已向 ${target} 发起互动`)
      } catch (err) {
        alert(err.message || '互动发送失败')
      }
    })
  })

  const runGeoLocate = () => {
    if (!navigator.geolocation) return alert('当前浏览器不支持定位')
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
    }, () => {
      state.gpsStatus = '定位失败，请手动授权'
      renderUI()
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 })
  }

  if (!state.autoLocated && navigator.geolocation) {
    state.autoLocated = true
    runGeoLocate()
  }
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
  if (verifyOverride === 'approved') state.me.user.verifyStatus = 'approved'
  if (me.location) {
    state.lat = String(me.location.lat ?? '')
    state.lng = String(me.location.lng ?? '')
  }
}

async function bootstrap() {
  mountShell()
  initMap()
  const [roles] = await Promise.all([
    request('/roles').catch(() => []),
    loadMe()
  ])
  state.roles = roles && roles.length ? roles : [...FALLBACK_ROLES]
  if (state.token) {
    const query = state.filterRoleCode ? `?roleCode=${encodeURIComponent(state.filterRoleCode)}` : ''
    state.nearby = await request(`/map/nearby${query}`, { headers: authHeaders() }).catch(() => [])
  }
  if (!state.nearby || !state.nearby.length) state.nearby = generateMockNearbyByRoles()
  renderUI()
}

bootstrap()
