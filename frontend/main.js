const apiBase = 'http://localhost:3000'

const state = {
  token: localStorage.getItem('sharele_token') || '',
  roles: [],
  selectedRoles: [],
  primaryRoleId: null,
  nearby: [],
  map: null,
  markers: [],
  filterRoleCode: ''
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

function render() {
  app.innerHTML = `
    <div class="page">
      <div class="brand">sharele</div>
      <div class="sub">移动职业/兴趣角色地图 · Web V0.2</div>

      <div class="card">
        <h3 class="h">1) 登录 / 注册</h3>
        <div class="row">
          <input id="phone" class="input" placeholder="手机号" />
          <input id="password" class="input" placeholder="密码" type="password" />
          <input id="nickname" class="input" placeholder="昵称（注册可填）" />
          <button id="register" class="btn sec">注册</button>
          <button id="login" class="btn">登录</button>
        </div>
      </div>

      <div class="card">
        <h3 class="h">2) 实名认证</h3>
        <div class="row">
          <input id="realName" class="input" placeholder="真实姓名" />
          <input id="idCardNo" class="input" placeholder="身份证号" />
          <button id="verify" class="btn">提交实名</button>
        </div>
      </div>

      <div class="card">
        <h3 class="h">3) 选择角色</h3>
        <div class="row" id="roleBoxes"></div>
        <div class="row" style="margin-top:10px">
          <select id="primaryRole" class="select"><option value="">选择主角色</option>${state.roles.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}</select>
          <button id="saveRoles" class="btn">保存角色</button>
        </div>
      </div>

      <div class="card">
        <h3 class="h">4) 地图与附近角色</h3>
        <div class="row">
          <input id="lat" class="input" placeholder="纬度，例如 30.2741" />
          <input id="lng" class="input" placeholder="经度，例如 120.1551" />
          <button id="uploadLoc" class="btn sec">更新我的位置</button>
        </div>
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
              <div class="tag">${item.roleName || '未设置角色'}</div>
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
      <input type="checkbox" value="${r.id}" ${state.selectedRoles.includes(r.id) ? 'checked' : ''} />
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
    const marker = window.L.marker([lat, lng]).addTo(state.map)
    marker.bindPopup(`<b>${item.nickname || `用户${item.id}`}</b><br/>${item.roleName || '未设置角色'}`)
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
      alert('登录成功')
    } catch (e) { alert(e.message) }
  }

  $('verify').onclick = async () => {
    try {
      await request('/verify/realname', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ realName: $('realName').value.trim(), idCardNo: $('idCardNo').value.trim() }) })
      alert('实名提交成功')
    } catch (e) { alert(e.message) }
  }

  $('saveRoles').onclick = async () => {
    try {
      const primaryRoleId = Number($('primaryRole').value || 0) || null
      await request('/user/roles', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ roleIds: state.selectedRoles, primaryRoleId }) })
      alert('角色保存成功')
    } catch (e) { alert(e.message) }
  }

  $('uploadLoc').onclick = async () => {
    try {
      await request('/user/location', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ lat: Number($('lat').value), lng: Number($('lng').value), isOnline: true }) })
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

async function bootstrap() {
  state.roles = await request('/roles').catch(() => [])
  render()
}

bootstrap()
