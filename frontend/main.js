const apiBase = 'http://localhost:3000'

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
    const icon = window.L.divIcon({ className: '', html: `<div class="role-pin ${visual.cls}">${visual.emoji}</div>`, iconSize: [34, 34], iconAnchor: [17, 17] })
    const marker = window.L.marker([lat, lng], { icon }).addTo(state.map)
    marker.bindPopup(`<b>${item.nickname || `用户${item.id}`}</b><br/>${visual.emoji} ${item.roleName || '未设置角色'}`)
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
      <button class="mini-btn" id="toggleRoles">角色</button>
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

  if (state.activePanel === 'verify') {
    const canVerify = Boolean(state.token)
    el.innerHTML = `<div class="floating-panel"><div class="panel-head"><div class="panel-title">实名认证</div><button class="mini-btn" id="closePanel">关闭</button></div>${!canVerify ? '<div class="panel-note warn">请先登录后再实名认证</div>' : ''}<div class="panel-row"><input id="realName" class="input" placeholder="真实姓名" ${canVerify ? '' : 'disabled'} value="${state.me ? (state.me.user.realName || '') : ''}" /><input id="idCardNo" class="input" placeholder="身份证号" ${canVerify ? '' : 'disabled'} /><button id="verify" class="btn" ${canVerify ? '' : 'disabled'}>提交实名</button></div></div>`
    return
  }

  const canEdit = Boolean(state.token && state.me && state.me.user && state.me.user.verifyStatus === 'approved')
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
  $('toggleRoles')?.addEventListener('click', () => togglePanel('roles'))
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
    state.token = ''; state.me = null; state.selectedRoles = []; state.primaryRoleId = null; localStorage.removeItem('sharele_token'); state.activePanel = ''; renderUI()
  })

  $('verify')?.addEventListener('click', async () => {
    try {
      const realName = String($('realName')?.value || '').trim()
      const idCardNo = String($('idCardNo')?.value || '').trim()
      if (!realName || !idCardNo) return alert('请填写真实姓名和身份证号')
      await request('/verify/realname', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ realName, idCardNo }) })
      await loadMe()
      state.activePanel = ''
      alert('实名提交成功')
      renderUI()
    } catch (e) { alert(e.message) }
  })

  $('saveRoles')?.addEventListener('click', async () => {
    try {
      const primaryRoleId = Number($('primaryRole').value || 0) || null
      if (!state.selectedRoles.length) return alert('请先选择至少一个角色')
      const ret = await request('/user/roles', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ roleIds: state.selectedRoles, primaryRoleId }) })
      state.primaryRoleId = ret.primaryRoleId
      state.activePanel = ''
      alert('角色保存成功')
      renderUI()
    } catch (e) { alert(e.message) }
  })

  $('geoLocate')?.addEventListener('click', () => {
    if (!navigator.geolocation) return alert('当前浏览器不支持定位')
    state.gpsStatus = '定位中...'; renderUI()
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = Number(pos.coords.latitude.toFixed(7))
      const lng = Number(pos.coords.longitude.toFixed(7))
      state.lat = String(lat); state.lng = String(lng); state.gpsStatus = `定位成功：${lat}, ${lng}`
      if (state.token) await request('/user/location', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ lat, lng, isOnline: true }) }).catch(() => {})
      renderUI()
    }, (err) => { state.gpsStatus = `定位失败：${err.message || '请检查定位权限'}`; renderUI() }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 })
  })

  $('loadNearby')?.addEventListener('click', async () => {
    try {
      const query = state.filterRoleCode ? `?roleCode=${encodeURIComponent(state.filterRoleCode)}` : ''
      state.nearby = await request(`/map/nearby${query}`, { headers: authHeaders() })
      renderUI()
    } catch (e) { alert(state.token ? e.message : '请先登录后再刷新附近角色') }
  })

  $('filterRole')?.addEventListener('change', (e) => { state.filterRoleCode = e.target.value })
}

async function loadMe() {
  if (!state.token) return (state.me = null)
  const me = await request('/user/me', { headers: authHeaders() }).catch(() => null)
  state.me = me
  if (!me) return
  state.selectedRoles = (me.roles || []).map(r => Number(r.id))
  const primary = (me.roles || []).find(r => Number(r.isPrimary) === 1)
  state.primaryRoleId = primary ? Number(primary.id) : (state.selectedRoles[0] || null)
  if (me.location) {
    state.lat = String(me.location.lat ?? '')
    state.lng = String(me.location.lng ?? '')
  }
}

async function bootstrap() {
  mountShell()
  initMap()
  state.roles = await request('/roles').catch(() => [])
  await loadMe()
  if (state.token) {
    const query = state.filterRoleCode ? `?roleCode=${encodeURIComponent(state.filterRoleCode)}` : ''
    state.nearby = await request(`/map/nearby${query}`, { headers: authHeaders() }).catch(() => [])
  }
  renderUI()
}

bootstrap()
