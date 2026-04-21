const apiBase = 'http://localhost:3000'

const state = {
  token: localStorage.getItem('sharele_token') || '',
  roles: [],
  selectedRoles: [],
  primaryRoleId: null,
  nearby: [],
  map: null,
  markers: [],
  filterRoleCode: '',
  gpsStatus: '未定位',
  lat: '',
  lng: '',
  me: null
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

function render() {
  app.innerHTML = `
    <div class="page">
      <div class="brand">sharele</div>
      <div class="sub">移动职业/兴趣角色地图 · Web V0.3</div>

      <div class="card">
        <h3 class="h">0) 我的状态</h3>
        <div class="small">${state.token ? '已登录' : '未登录'}${state.me ? ` · ${state.me.user.nickname || state.me.user.phone}` : ''}</div>
        <div class="small">实名状态：${state.me ? state.me.user.verifyStatus : '未知'}</div>
      </div>

      <div class="card">
        <h3 class="h">1) 登录 / 注册</h3>
        <div class="row">
          <input id="phone" class="input" placeholder="手机号" value="${state.me ? (state.me.user.phone || '') : ''}" />
          <input id="password" class="input" placeholder="密码" type="password" />
          <input id="nickname" class="input" placeholder="昵称（注册可填）" value="${state.me ? (state.me.user.nickname || '') : ''}" />
          <button id="register" class="btn sec">注册</button>
          <button id="login" class="btn">登录</button>
          <button id="logout" class="btn sec">退出登录</button>
        </div>
      </div>

      <div class="card">
        <h3 class="h">2) 实名认证</h3>
        <div class="row">
          <input id="realName" class="input" placeholder="真实姓名" value="${state.me ? (state.me.user.realName || '') : ''}" />
          <input id="idCardNo" class="input" placeholder="身份证号" />
          <button id="verify" class="btn">提交实名</button>
        </div>
      </div>

      <div class="card">
        <h3 class="h">3) 选择角色</h3>
        <div class="row" id="roleBoxes"></div>
        <div class="row" style="margin-top:10px">
          <select id="primaryRole" class="select"><option value="">选择主角色</option>${state.roles.map(r => `<option value="${r.id}" ${Number(state.primaryRoleId)===Number(r.id)?'selected':''}>${r.name}</option>`).join('')}</select>
          <button id="saveRoles" class="btn">保存角色</button>
        </div>
      </div>

      <div class="card">
        <h3 class="h">4) 地图与附近角色</h3>
        <div class="row">
          <input id="lat" class="input" placeholder="纬度，例如 30.2741" value="${state.lat}" />
          <input id="lng" class="input" placeholder="经度，例如 120.1551" value="${state.lng}" />
          <button id="geoLocate" class="btn sec">自动定位(GPS)</button>
          <button id="uploadLoc" class="btn sec">更新我的位置</button>
        </div>
        <div class="gps-note">定位状态：${state.gpsStatus}</div>
        <div class="row" style="margin-top:10px">
          <select id="filterRole" class="select">
            <option value="">全部角色</option>
            ${state.roles.map(r => `<option value="${r.code}" ${state.filterRoleCode === r.code ? 'selected' : ''}>${r.name}</option>`).join('')}
          </select>
          <button id="loadNearby" class="btn">刷新附近角色</button>
        </div>
        <div id="map"></div>
        <div class="grid" style="margin-top:12px">
          ${state.nearby.map(item => `
            <div class="item">
              <div class="tag">${roleVisual(item.roleCode).emoji} ${item.roleName || '未设置角色'}</div>
              <div>${item.nickname || `用户${item.id}`}</div>
              <div class="small">lat: ${item.lat}, lng: ${item.lng}</div>
            </div>
          `).join('') || '<div class="small">暂无数据</div>'}
        </div>
      </div>
    </div>
  `

  bindActions()
  renderRoleChecks()
  renderMap()
}

function renderRoleChecks() {
  const box = document.querySelector('#roleBoxes')
  if (!box) return
  box.innerHTML = state.roles.map(r => `
    <label class="item" style="display:flex;align-items:center;gap:8px;min-width:220px">
      <input type="checkbox" value="${r.id}" ${state.selectedRoles.includes(Number(r.id)) ? 'checked' : ''} />
      <span>${r.name}</span>
      <span class="small">${r.category}</span>
    </label>
  `).join('')

  box.querySelectorAll('input[type="checkbox"]').forEach(el => {
    el.addEventListener('change', () => {
      const id = Number(el.value)
      if (el.checked) {
        if (!state.selectedRoles.includes(id)) state.selectedRoles.push(id)
      } else {
        state.selectedRoles = state.selectedRoles.filter(x => x !== id)
      }
    })
  })
}

function clearMarkers() {
  if (!state.map) return
  state.markers.forEach(m => state.map.removeLayer(m))
  state.markers = []
}

function renderMap() {
  const mapEl = document.getElementById('map')
  if (!mapEl || !window.L) return

  if (!state.map) {
    state.map = window.L.map('map').setView([30.2741, 120.1551], 11)
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(state.map)
  }

  clearMarkers()
  if (!state.nearby.length) return

  const points = []
  state.nearby.forEach(item => {
    const lat = Number(item.lat)
    const lng = Number(item.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    points.push([lat, lng])
    const visual = roleVisual(item.roleCode)
    const icon = window.L.divIcon({
      className: '',
      html: `<div class="role-pin ${visual.cls}">${visual.emoji}</div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    })
    const marker = window.L.marker([lat, lng], { icon }).addTo(state.map)
    marker.bindPopup(`<b>${item.nickname || `用户${item.id}`}</b><br/>${visual.emoji} ${item.roleName || '未设置角色'}`)
    state.markers.push(marker)
  })

  if (points.length) {
    const bounds = window.L.latLngBounds(points)
    state.map.fitBounds(bounds.pad(0.2))
  }
}

function bindActions() {
  const $ = (id) => document.getElementById(id)

  $('register').onclick = async () => {
    try {
      await request('/auth/register', { method: 'POST', body: JSON.stringify({ phone: $('phone').value.trim(), password: $('password').value, nickname: $('nickname').value.trim() }) })
      alert('注册成功，请登录')
    } catch (e) { alert(e.message) }
  }

  $('login').onclick = async () => {
    try {
      const data = await request('/auth/login', { method: 'POST', body: JSON.stringify({ phone: $('phone').value.trim(), password: $('password').value }) })
      state.token = data.token
      localStorage.setItem('sharele_token', data.token)
      await loadMe()
      alert('登录成功')
      render()
    } catch (e) { alert(e.message) }
  }

  $('logout').onclick = () => {
    state.token = ''
    state.me = null
    state.selectedRoles = []
    state.primaryRoleId = null
    state.nearby = []
    localStorage.removeItem('sharele_token')
    alert('已退出登录')
    render()
  }

  $('verify').onclick = async () => {
    try {
      await request('/verify/realname', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ realName: $('realName').value.trim(), idCardNo: $('idCardNo').value.trim() }) })
      await loadMe()
      alert('实名提交成功')
      render()
    } catch (e) { alert(e.message) }
  }

  $('saveRoles').onclick = async () => {
    try {
      const primaryRoleId = Number($('primaryRole').value || 0) || null
      if (!state.selectedRoles.length) {
        alert('请先选择至少一个角色')
        return
      }
      const ret = await request('/user/roles', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ roleIds: state.selectedRoles, primaryRoleId }) })
      state.primaryRoleId = ret.primaryRoleId
      alert('角色保存成功')
      render()
    } catch (e) { alert(e.message) }
  }

  $('geoLocate').onclick = () => {
    if (!navigator.geolocation) {
      state.gpsStatus = '当前浏览器不支持定位'
      render()
      return
    }
    state.gpsStatus = '定位中...'
    render()
    navigator.geolocation.getCurrentPosition((pos) => {
      const lat = Number(pos.coords.latitude.toFixed(7))
      const lng = Number(pos.coords.longitude.toFixed(7))
      state.lat = String(lat)
      state.lng = String(lng)
      state.gpsStatus = `定位成功：${lat}, ${lng}`
      if (state.map) state.map.setView([lat, lng], 14)
      render()
    }, (err) => {
      state.gpsStatus = `定位失败：${err.message || '请检查定位权限'}`
      render()
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 })
  }

  $('uploadLoc').onclick = async () => {
    try {
      state.lat = $('lat').value
      state.lng = $('lng').value
      await request('/user/location', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ lat: Number(state.lat), lng: Number(state.lng), isOnline: true }) })
      alert('位置更新成功')
    } catch (e) { alert(e.message) }
  }

  $('filterRole').onchange = () => {
    state.filterRoleCode = $('filterRole').value
  }

  $('loadNearby').onclick = async () => {
    try {
      const query = state.filterRoleCode ? `?roleCode=${encodeURIComponent(state.filterRoleCode)}` : ''
      state.nearby = await request(`/map/nearby${query}`, { headers: authHeaders() })
      render()
    } catch (e) { alert(e.message) }
  }
}

async function loadMe() {
  if (!state.token) {
    state.me = null
    return
  }
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
  state.roles = await request('/roles').catch(() => [])
  await loadMe()
  render()
}

bootstrap()
