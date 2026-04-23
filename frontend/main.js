const SHARELE_CONFIG = {
  envName: window.__SHARELE_CONFIG__?.envName || 'local',
  apiBase: window.__SHARELE_CONFIG__?.apiBase || window.SHARELE_API_BASE || '',
  amapKey: window.__SHARELE_CONFIG__?.amapKey || window.SHARELE_AMAP_KEY || ''
}

const API_CANDIDATES = (() => {
  const { protocol, hostname, origin } = window.location
  const localSet = ['localhost', '127.0.0.1', '0.0.0.0']
  const configured = [
    SHARELE_CONFIG.apiBase,
    localStorage.getItem('sharele_api_base')
  ].filter(Boolean)
  const out = [...configured]

  if (localSet.includes(hostname)) {
    out.push('http://127.0.0.1:3000')
    out.push('http://localhost:3000')
  } else {
    out.push(`${protocol}//${hostname}:3000`)
    out.push('https://shareleapi.wh1997.com')
    out.push('http://127.0.0.1:3000')
  }

  if (!out.includes(origin)) out.push(origin)
  return Array.from(new Set(out.filter(Boolean)))
})()

let apiBase = API_CANDIDATES[0]

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

const ROLE_FAMILY_MAP = {
  photographer: 'image-service',
  makeup: 'image-service',
  model: 'image-service',
  snack: 'food-service',
  foodie: 'food-service',
  cyclist: 'outdoor',
  hiker: 'outdoor',
  visitor: 'visitor'
}

const state = {
  token: localStorage.getItem('sharele_token') || '',
  apiReady: false,
  apiProbeFailed: false,
  roles: [],
  selectedRoles: [],
  primaryRoleId: null,
  nearby: [],
  nearby1km: [],
  map: null,
  mapEngine: 'leaflet',
  markers: [],
  markerMap: {},
  myCircle: null,
  filterRoleCode: '',
  gpsStatus: '未定位',
  mapStatus: '地图加载中',
  lat: '',
  lng: '',
  me: null,
  interactions: [],
  interactionToast: null,
  notice: null,
  composer: null,
  subPanel: '',
  highlightedUserId: '',
  loading: {},
  autoLocated: false,
  activeTab: localStorage.getItem('sharele_active_tab') || 'nearby',
  sheetOpen: true,
  authMode: 'login',
  syncingNearby: false,
  mapRefreshTimer: null,
  hasInitialViewport: false
}

const app = document.querySelector('#app')

function authHeaders() {
  return state.token ? { Authorization: `Bearer ${state.token}` } : {}
}

function persistUiState() {
  if (state.activeTab) localStorage.setItem('sharele_active_tab', state.activeTab)
}

function requireApiReady(actionLabel = '该操作') {
  if (state.apiReady) return true
  state.activeTab = state.activeTab || 'nearby'
  state.sheetOpen = true
  persistUiState()
  showNotice(`${actionLabel} 依赖后端服务，当前处于离线浏览模式，请稍后再试。`, 'error')
  renderUI()
  return false
}

async function probeApiBase() {
  for (const base of API_CANDIDATES) {
    try {
      const res = await fetch(`${base}/health`, { method: 'GET' })
      if (res.ok) {
        apiBase = base
        state.apiReady = true
        state.apiProbeFailed = false
        return base
      }
    } catch {}
  }
  state.apiReady = false
  state.apiProbeFailed = true
  return apiBase
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }

  try {
    const res = await fetch(`${apiBase}${path}`, {
      ...options,
      headers
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || '请求失败')
    state.apiReady = true
    state.apiProbeFailed = false
    return data
  } catch (err) {
    if (!state.apiProbeFailed) {
      showNotice('后端服务暂时不可用，已切换为浏览/演示模式。', 'error')
    }
    state.apiReady = false
    state.apiProbeFailed = true
    throw err
  }
}

function roleVisual(roleCode = '') {
  const map = {
    photographer: {
      emoji: '📷',
      cls: 'role-photographer',
      tone: '影像协作',
      accent: '#8b5cf6',
      soft: 'rgba(139,92,246,.14)',
      ring: 'rgba(139,92,246,.26)',
      gradient: 'linear-gradient(135deg,#c4b5fd,#8b5cf6)',
      markerLabel: '摄',
      badge: '擅长出片与构图'
    },
    makeup: {
      emoji: '💄',
      cls: 'role-makeup',
      tone: '妆造协作',
      accent: '#ec4899',
      soft: 'rgba(236,72,153,.14)',
      ring: 'rgba(236,72,153,.26)',
      gradient: 'linear-gradient(135deg,#f9a8d4,#ec4899)',
      markerLabel: '妆',
      badge: '擅长妆面与造型'
    },
    model: {
      emoji: '🧍',
      cls: 'role-model',
      tone: '拍摄搭档',
      accent: '#0ea5e9',
      soft: 'rgba(14,165,233,.14)',
      ring: 'rgba(14,165,233,.26)',
      gradient: 'linear-gradient(135deg,#7dd3fc,#0ea5e9)',
      markerLabel: '模',
      badge: '适合拍摄与出镜'
    },
    snack: {
      emoji: '🍢',
      cls: 'role-snack',
      tone: '街头供给',
      accent: '#f59e0b',
      soft: 'rgba(245,158,11,.14)',
      ring: 'rgba(245,158,11,.26)',
      gradient: 'linear-gradient(135deg,#fde68a,#f59e0b)',
      markerLabel: '摊',
      badge: '适合快逛快吃'
    },
    foodie: {
      emoji: '🍜',
      cls: 'role-foodie',
      tone: '吃喝同好',
      accent: '#ef4444',
      soft: 'rgba(239,68,68,.14)',
      ring: 'rgba(239,68,68,.26)',
      gradient: 'linear-gradient(135deg,#fca5a5,#ef4444)',
      markerLabel: '吃',
      badge: '偏向探店与打卡'
    },
    cyclist: {
      emoji: '🚴',
      cls: 'role-cyclist',
      tone: '骑行同路',
      accent: '#22c55e',
      soft: 'rgba(34,197,94,.14)',
      ring: 'rgba(34,197,94,.26)',
      gradient: 'linear-gradient(135deg,#86efac,#22c55e)',
      markerLabel: '骑',
      badge: '适合结伴骑行'
    },
    hiker: {
      emoji: '⛰️',
      cls: 'role-hiker',
      tone: '徒步自然',
      accent: '#64748b',
      soft: 'rgba(100,116,139,.16)',
      ring: 'rgba(100,116,139,.24)',
      gradient: 'linear-gradient(135deg,#cbd5e1,#64748b)',
      markerLabel: '徒',
      badge: '适合户外结伴'
    },
    visitor: {
      emoji: '👀',
      cls: 'role-visitor',
      tone: '仅浏览',
      accent: '#94a3b8',
      soft: 'rgba(148,163,184,.16)',
      ring: 'rgba(148,163,184,.22)',
      gradient: 'linear-gradient(135deg,#e2e8f0,#94a3b8)',
      markerLabel: '看',
      badge: '当前只展示附近路人'
    }
  }
  return map[roleCode] || {
    emoji: '📍',
    cls: 'role-default',
    tone: '附近的人',
    accent: '#64748b',
    soft: 'rgba(100,116,139,.16)',
    ring: 'rgba(100,116,139,.24)',
    gradient: 'linear-gradient(135deg,#cbd5e1,#64748b)',
    markerLabel: '人',
    badge: '附近可见'
  }
}

function roleNarrative(roleCode = '') {
  const map = {
    photographer: {
      vibe: '偏出片、构图、拍摄配合',
      prompt: '适合约拍、互拍、补作品集',
      nearby: '更适合在附近快速找到拍摄搭子'
    },
    makeup: {
      vibe: '偏妆造、形象整理、拍摄配套',
      prompt: '适合约妆、试妆、拍摄前协作',
      nearby: '更适合临时快速匹配妆造需求'
    },
    model: {
      vibe: '偏出镜、拍摄搭档、内容合作',
      prompt: '适合约拍、试镜、素材共创',
      nearby: '更适合快速形成轻量拍摄组合'
    },
    snack: {
      vibe: '偏街头小吃、移动摊点、即时供给',
      prompt: '适合路过即买、顺手打卡、现场补给',
      nearby: '更适合在附近解决吃喝与逛感'
    },
    foodie: {
      vibe: '偏探店、拼饭、吃喝体验交流',
      prompt: '适合一起找店、拼桌、分享口碑',
      nearby: '更适合附近即时约吃和交换情报'
    },
    cyclist: {
      vibe: '偏路线、节奏、装备与结伴骑行',
      prompt: '适合约短线骑行、拉练、顺路同行',
      nearby: '更适合快速约到同一片区的骑友'
    },
    hiker: {
      vibe: '偏徒步、爬山、自然路线共行',
      prompt: '适合约近郊徒步、周末轻登山',
      nearby: '更适合在出发前临时找到同路人'
    },
    visitor: {
      vibe: '当前仅浏览附近角色分布',
      prompt: '登录并选角色后，地图会更有针对性',
      nearby: '现在看到的是游客态的附近视图'
    }
  }
  return map[roleCode] || {
    vibe: '附近可见的角色用户',
    prompt: '适合先看看附近有什么人',
    nearby: '更适合做周边角色分布浏览'
  }
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

function getAmapBounds(lat, lng, radiusMeters = 1000) {
  const dLat = radiusMeters / 111000
  const dLng = radiusMeters / (111000 * Math.cos((lat * Math.PI) / 180) || 1)
  return new window.AMap.Bounds([lng - dLng, lat - dLat], [lng + dLng, lat + dLat])
}

function randomInRange(min, max) {
  return Math.random() * (max - min) + min
}

function resolveVisibleFamily() {
  if (!state.token) return 'visitor'
  const selected = (state.selectedRoles || []).map(id => state.roles.find(r => Number(r.id) === Number(id))).filter(Boolean)
  const first = selected[0]
  if (!first) return 'visitor'
  return ROLE_FAMILY_MAP[first.code] || 'visitor'
}

function generateMockNearbyByRoles() {
  const myLat = Number(state.lat)
  const myLng = Number(state.lng)
  if (!Number.isFinite(myLat) || !Number.isFinite(myLng)) return []

  const visibleFamily = resolveVisibleFamily()
  let sourceRoles = []
  if (visibleFamily === 'visitor') {
    sourceRoles = [{ id: 999, code: 'visitor', name: '路人', category: '游客' }]
  } else {
    sourceRoles = (state.roles && state.roles.length ? state.roles : FALLBACK_ROLES)
      .filter(role => ROLE_FAMILY_MAP[role.code] === visibleFamily)
  }

  let idx = 1
  const out = []
  sourceRoles.forEach(role => {
    for (let i = 0; i < 5; i += 1) {
      const lat = myLat + randomInRange(-0.006, 0.006)
      const lng = myLng + randomInRange(-0.006, 0.006)
      out.push({
        id: `mock-${role.code}-${idx++}`,
        nickname: `${role.name}${i + 1}号`,
        roleCode: role.code,
        roleName: role.name,
        bio: visibleFamily === 'visitor' ? '路人模式下，仅可浏览周边路人。' : `我是${role.name}，和你属于同一类人群。`,
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
      <div id="interactionToastHost"></div>
      <div id="noticeHost"></div>
      <div id="composerHost"></div>
      <div id="map" class="full-map"></div>
      <div id="sheet" class="bottom-sheet"></div>
      <div id="tabbar" class="tabbar"></div>
    </div>
  `
}

function initLeafletMap() {
  state.mapEngine = 'leaflet'
  state.map = window.L.map('map', { zoomControl: false }).setView([30.2741, 120.1551], 13)
  const layers = [
    { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', options: { subdomains: ['a', 'b', 'c'], maxZoom: 19, minZoom: 3, attribution: '&copy; OpenStreetMap' } },
    { url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', options: { subdomains: ['a', 'b', 'c'], maxZoom: 19, minZoom: 3, attribution: '&copy; OpenStreetMap' } }
  ]
  let idx = 0
  const addFallbackGrid = () => {
    state.mapStatus = '已切换本地网格底图'
    renderTopBar()
    window.L.gridLayer({ attribution: 'sharele fallback grid' }).createTile = function(coords) {
      const tile = document.createElement('canvas')
      const size = this.getTileSize()
      tile.width = size.x
      tile.height = size.y
      const ctx = tile.getContext('2d')
      const bg = ctx.createLinearGradient(0, 0, size.x, size.y)
      bg.addColorStop(0, '#edf4fb')
      bg.addColorStop(1, '#d9e8f6')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, size.x, size.y)
      ctx.strokeStyle = 'rgba(71, 85, 105, 0.28)'
      ctx.lineWidth = 1
      ctx.strokeRect(0, 0, size.x, size.y)
      ctx.fillStyle = 'rgba(15, 23, 42, 0.72)'
      ctx.font = '12px sans-serif'
      ctx.fillText(`sharele fallback map`, 12, 22)
      ctx.fillText(`z${coords.z} · x${coords.x} · y${coords.y}`, 12, 42)
      return tile
    }.addTo(state.map)
  }
  const load = () => {
    const conf = layers[idx]
    if (!conf) return addFallbackGrid()
    const layer = window.L.tileLayer(conf.url, conf.options)
    state.mapStatus = '地图底图加载中'
    renderTopBar()
    let switched = false
    layer.on('tileerror', () => {
      if (switched) return
      switched = true
      state.map.removeLayer(layer)
      idx += 1
      load()
    })
    layer.on('load', () => {
      state.mapStatus = '地图已加载'
      renderTopBar()
    })
    layer.addTo(state.map)
  }
  load()
  state.map.on('zoomend moveend', handleMapViewportChange)
  state.map.on('click', () => {
    if (state.sheetOpen) {
      state.sheetOpen = false
      renderSheet()
      bindActions()
    }
  })
}

function initAmap() {
  state.mapEngine = 'amap'
  state.map = new window.AMap.Map('map', {
    zoom: 13,
    center: [120.1551, 30.2741],
    viewMode: '2D',
    mapStyle: 'amap://styles/normal'
  })
  state.mapStatus = '高德地图已加载'
  renderTopBar()
  state.map.on('zoomend', handleMapViewportChange)
  state.map.on('moveend', handleMapViewportChange)
  state.map.on('click', () => {
    if (state.sheetOpen) {
      state.sheetOpen = false
      renderSheet()
      bindActions()
    }
  })
}

function initMap() {
  if (state.map) return
  try {
    if (window.AMap && typeof window.AMap.Map === 'function') {
      initAmap()
      return
    }
  } catch {}
  initLeafletMap()
}

function handleMapViewportChange() {
  renderMapOverlays()
  if (!state.token) return
  if (state.mapRefreshTimer) clearTimeout(state.mapRefreshTimer)
  state.mapRefreshTimer = setTimeout(async () => {
    if (state.syncingNearby) return
    state.syncingNearby = true
    try {
      const query = state.filterRoleCode ? `?roleCode=${encodeURIComponent(state.filterRoleCode)}` : ''
      const list = await request(`/map/nearby${query}`, { headers: authHeaders() }).catch(() => state.nearby)
      if (list && list.length) {
        state.nearby = list
        applyNearby1kmFilter()
        renderSheet()
        bindActions()
      }
    } finally {
      state.syncingNearby = false
    }
  }, 220)
}

function clearMapOverlays() {
  if (!state.map) return
  if (state.mapEngine === 'amap') {
    state.markers.forEach(m => state.map.remove(m))
    state.markers = []
    state.markerMap = {}
    if (state.myCircle) {
      state.map.remove(state.myCircle)
      state.myCircle = null
    }
    return
  }
  state.markers.forEach(m => state.map.removeLayer(m))
  state.markers = []
  state.markerMap = {}
  if (state.myCircle) {
    state.map.removeLayer(state.myCircle)
    state.myCircle = null
  }
}

function clusterColorClass(items = []) {
  const first = items[0] || {}
  const roleCode = String(first.roleCode || '')
  return `cluster-${roleCode || 'default'}`
}

function clusterNearbyItems(items = []) {
  if (!state.map) return []
  const zoom = state.map.getZoom()
  if (zoom >= 16) {
    return items.map(item => ({ type: 'single', items: [item], center: [Number(item.lat), Number(item.lng)] }))
  }

  const radiusPx = zoom >= 14 ? 44 : 60
  const clusters = []
  items.forEach(item => {
    const lat = Number(item.lat)
    const lng = Number(item.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    const point = state.map.latLngToLayerPoint([lat, lng])
    let matched = null
    for (const cluster of clusters) {
      const dx = cluster.point.x - point.x
      const dy = cluster.point.y - point.y
      if (Math.sqrt(dx * dx + dy * dy) <= radiusPx) {
        matched = cluster
        break
      }
    }
    if (matched) {
      matched.items.push(item)
      const count = matched.items.length
      matched.center = [
        (matched.center[0] * (count - 1) + lat) / count,
        (matched.center[1] * (count - 1) + lng) / count
      ]
    } else {
      clusters.push({ type: 'cluster', items: [item], point, center: [lat, lng] })
    }
  })

  return clusters.map(cluster => cluster.items.length === 1
    ? { type: 'single', items: cluster.items, center: [Number(cluster.items[0].lat), Number(cluster.items[0].lng)] }
    : cluster)
}

function renderPersonSnippet(item = {}, options = {}) {
  const name = item.nickname || `用户${item.id || ''}`
  const visual = roleVisual(item.roleCode)
  const narrative = roleNarrative(item.roleCode)
  const role = item.roleName || '未设置角色'
  const distance = Number(item.distanceKm || 0).toFixed(2)
  const bio = item.bio || narrative.vibe || '这个人还没写简介'
  const showDistance = options.showDistance !== false
  const statusText = options.statusText || ''
  const toneText = options.toneText === false ? '' : (visual.tone || '')
  const badgeText = options.badgeText === false ? '' : (visual.badge || '')
  const promptText = options.promptText === false ? '' : (narrative.prompt || '')
  return `
    <div class="person-snippet ${visual.cls}">
      <div class="person-name-row">
        <div class="person-name">${name}</div>
        <div class="person-role role-pill ${visual.cls}">${visual.emoji} ${role}</div>
      </div>
      ${toneText ? `<div class="person-role-tone">${toneText}</div>` : ''}
      <div class="person-bio">${bio}</div>
      ${badgeText ? `<div class="person-role-badge ${visual.cls}">${badgeText}</div>` : ''}
      ${promptText ? `<div class="person-role-prompt">${promptText}</div>` : ''}
      <div class="person-meta-row">
        ${showDistance ? `<div class="person-meta">${distance} km 内</div>` : ''}
        ${statusText ? `<div class="person-inline-state ${visual.cls}">${statusText}</div>` : ''}
      </div>
    </div>
  `
}

function renderMapOverlays() {
  if (!state.map) return
  clearMapOverlays()
  const myLat = Number(state.lat)
  const myLng = Number(state.lng)

  if (state.mapEngine === 'amap') {
    if (Number.isFinite(myLat) && Number.isFinite(myLng)) {
      const bounds = getAmapBounds(myLat, myLng, 1000)
      state.myCircle = new window.AMap.Circle({
        center: [myLng, myLat],
        radius: 1000,
        strokeColor: '#38bdf8',
        strokeWeight: 2,
        fillOpacity: 0
      })
      state.map.add(state.myCircle)
      if (!state.hasInitialViewport) {
        state.map.setBounds(bounds)
        state.hasInitialViewport = true
      }
    }

    ;(state.nearby1km || []).forEach(item => {
      const lat = Number(item.lat)
      const lng = Number(item.lng)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
      const name = item.nickname || `用户${item.id}`
      const avatarUrl = item.avatarUrl || ''
      const visual = roleVisual(item.roleCode)
      const marker = new window.AMap.Marker({
        position: [lng, lat],
        offset: new window.AMap.Pixel(-26, -26),
        content: `<div class="avatar-pin ${visual.cls}"><div class="avatar-pin-ring" style="background:${visual.gradient}; box-shadow: 0 0 0 4px ${visual.soft}">${avatarUrl ? `<img src="${avatarUrl}" alt="${name}" />` : `<div class="avatar-fallback" style="background:${visual.gradient}">${visual.markerLabel}</div>`}</div></div>`
      })
      marker.on('click', () => {
        state.highlightedUserId = String(item.id)
        renderSheet()
        bindActions()
        const info = new window.AMap.InfoWindow({
          offset: new window.AMap.Pixel(0, -28),
          content: `<div class="popup-card"><div class="popup-head"><div class="popup-avatar">${avatarUrl ? `<img src="${avatarUrl}" alt="${name}" />` : `<div class="avatar-fallback">${name.slice(0,1)}</div>`}</div>${renderPersonSnippet(item, { statusText: '地图定位中' })}</div><div class="popup-meta">${roleNarrative(item.roleCode).nearby} · 点击下方可继续互动</div><button class="interact-btn" data-id="${item.id}" data-role-code="${item.roleCode || ''}" data-target="${name}" ${state.canInteract ? '' : 'disabled'}>${roleActionText(item.roleCode, state.canInteract)}</button></div>`
        })
        info.open(state.map, [lng, lat])
      })
      state.map.add(marker)
      state.markers.push(marker)
      state.markerMap[String(item.id)] = marker
    })
    return
  }

  if (Number.isFinite(myLat) && Number.isFinite(myLng)) {
    const circleBounds = getMapCircleBounds(myLat, myLng, 1000)
    state.myCircle = window.L.circle([myLat, myLng], { radius: 1000, color: '#38bdf8', weight: 1.5, fillOpacity: 0 }).addTo(state.map)
    if (!state.hasInitialViewport) {
      state.map.fitBounds(circleBounds, { padding: [32, 32] })
      state.hasInitialViewport = true
    }
  }

  const clustered = clusterNearbyItems(state.nearby1km || [])
  clustered.forEach(group => {
    const [lat, lng] = group.center
    if (group.items.length > 1) {
      const icon = window.L.divIcon({
        className: '',
        html: `<div class="cluster-pin ${clusterColorClass(group.items)}"><span>${group.items.length}</span></div>`,
        iconSize: [48, 48],
        iconAnchor: [24, 24]
      })
      const marker = window.L.marker([lat, lng], { icon }).addTo(state.map)
      marker.on('click', () => {
        state.map.setView([lat, lng], Math.min((state.map.getZoom() || 13) + 2, 18), { animate: true })
      })
      state.markers.push(marker)
      return
    }

    const item = group.items[0]
    const visual = roleVisual(item.roleCode)
    const avatarUrl = item.avatarUrl || ''
    const name = item.nickname || `用户${item.id}`
    const icon = window.L.divIcon({
      className: '',
      html: `<div class="avatar-pin ${visual.cls}"><div class="avatar-pin-ring" style="background:${visual.gradient}; box-shadow: 0 0 0 4px ${visual.soft}">${avatarUrl ? `<img src="${avatarUrl}" alt="${name}" />` : `<div class="avatar-fallback" style="background:${visual.gradient}">${visual.markerLabel}</div>`}</div></div>`,
      iconSize: [52, 52],
      iconAnchor: [26, 26]
    })
    const marker = window.L.marker([lat, lng], { icon, riseOnHover: true }).addTo(state.map)
    marker.bindPopup(`
      <div class="popup-card">
        <div class="popup-arrow"></div>
        <div class="popup-head">
          <div class="popup-avatar">${avatarUrl ? `<img src="${avatarUrl}" alt="${name}" />` : `<div class="avatar-fallback">${name.slice(0,1)}</div>`}</div>
          ${renderPersonSnippet({ ...item, roleName: `${visual.emoji} ${item.roleName || '未设置角色'}` }, { statusText: '地图定位中' })}
        </div>
        <div class="popup-meta">${roleNarrative(item.roleCode).nearby} · 点击下方可继续互动</div>
        <button class="interact-btn" data-id="${item.id}" data-role-code="${item.roleCode || ''}" data-target="${name}" ${state.canInteract ? '' : 'disabled'}>${roleActionText(item.roleCode, state.canInteract)}</button>
      </div>
    `)
    marker.on('popupopen', () => {
      state.highlightedUserId = String(item.id)
      renderSheet()
      bindActions()
      const el = marker.getElement()
      if (el) el.classList.add('pin-active')
    })
    marker.on('popupclose', () => {
      state.highlightedUserId = ''
      renderSheet()
      bindActions()
      const el = marker.getElement()
      if (el) el.classList.remove('pin-active')
    })
    state.markers.push(marker)
    state.markerMap[String(item.id)] = marker
  })
  state.map.invalidateSize()
}

function roleActionText(roleCode = '', canInteract = true) {
  if (!canInteract) return '仅可查看'
  const map = {
    photographer: '约拍',
    makeup: '约妆',
    model: '约搭档',
    snack: '去看看',
    foodie: '约吃',
    cyclist: '约骑',
    hiker: '约徒步',
    visitor: '先看看'
  }
  return map[roleCode] || '发起互动'
}

function getLegendRoles() {
  const visible = (state.nearby1km || []).map(item => String(item.roleCode || '')).filter(Boolean)
  const unique = Array.from(new Set(visible))
  if (unique.length) return unique.slice(0, 4)
  const selected = state.roles.find(r => Number(r.id) === Number(state.primaryRoleId || state.selectedRoles?.[0]))
  return [selected?.code || 'visitor']
}

function getMapStateSummary() {
  if (!state.token) {
    return '当前为游客浏览模式，优先展示附近可浏览的路人视图。'
  }
  const activeRole = state.roles.find(r => Number(r.id) === Number(state.primaryRoleId || state.selectedRoles?.[0]))
  if (!activeRole) {
    return '你还没有选主角色，因此地图不会聚焦到明确人群。'
  }
  if (state.filterRoleCode) {
    const filteredRole = state.roles.find(r => r.code === state.filterRoleCode) || FALLBACK_ROLES.find(r => r.code === state.filterRoleCode)
    return `当前筛选为 ${filteredRole?.name || '指定角色'}，地图只显示这一类角色。`
  }
  const family = resolveVisibleFamily()
  const familyMap = {
    'image-service': '当前优先展示影像协作类角色，例如摄影、妆造、模特。',
    'food-service': '当前优先展示吃喝相关角色，例如小吃摊和吃货同好。',
    'outdoor': '当前优先展示户外同好，例如骑友和登山客。',
    'visitor': '当前是游客态，只展示基础可浏览角色。'
  }
  return familyMap[family] || '当前展示附近可见角色。'
}

function renderTopBar() {
  const el = document.getElementById('topBar')
  if (!el) return
  const meUser = (state.me && state.me.user) || {}
  const activeRole = state.roles.find(r => Number(r.id) === Number(state.primaryRoleId || state.selectedRoles?.[0]))
  const roleLabel = activeRole ? activeRole.name : '未选择角色'
  const nearbyCount = (state.nearby1km || []).length
  const legendRoles = getLegendRoles()
  const mapStateSummary = getMapStateSummary()
  const legendHtml = legendRoles.map(code => {
    const visual = roleVisual(code)
    const role = state.roles.find(r => r.code === code) || FALLBACK_ROLES.find(r => r.code === code) || { name: code || '角色' }
    return `<span class="legend-chip ${visual.cls}"><span class="legend-dot" style="background:${visual.gradient}"></span>${visual.emoji} ${role.name}</span>`
  }).join('')
  el.innerHTML = `
    <div class="brand-chip hero-chip">
      <div class="brand-row">
        <div>
          <div class="brand">sharele-共享世界</div>
          <div class="sub">移动职业 / 兴趣角色地图</div>
        </div>
        <div class="brand-badge">${String(SHARELE_CONFIG.envName || 'local').toUpperCase()} · BETA</div>
      </div>
      <div class="hero-meta">
        <span class="hero-pill">当前角色：${roleLabel}</span>
        <span class="hero-pill">1km 内 ${nearbyCount} 人</span>
        <span class="hero-pill ${state.apiReady ? 'hero-pill-live' : 'hero-pill-offline'}">${state.apiReady ? `后端在线 · ${apiBase}` : '离线浏览模式'}</span>
        <span class="hero-pill">地图引擎：${window.AMap && typeof window.AMap.Map === 'function' ? '高德' : 'Leaflet'}</span>
      </div>
      <div class="map-state-copy">${mapStateSummary}</div>
      <div class="role-legend-row"><span class="legend-title">当前可见角色</span>${legendHtml}</div>
    </div>
    <div class="top-right">
      <div class="gps-chip">${state.gpsStatus}</div>
      <div class="gps-chip">${state.mapStatus}</div>
      <button class="avatar-entry" id="openMy">${meUser.avatarUrl ? `<img src="${meUser.avatarUrl}" alt="me" />` : `<span>${(meUser.nickname || '我').slice(0,1)}</span>`}</button>
    </div>
  `
}

function renderSheet() {
  const el = document.getElementById('sheet')
  if (!el) return
  const meUser = (state.me && state.me.user) || {}
  const canEditRoles = Boolean(state.token)
  const canInteract = Boolean(state.token && meUser.verifyStatus === 'approved')
  const hasPrimaryRole = Boolean(state.primaryRoleId || state.selectedRoles?.length)
  state.canInteract = canInteract

  let content = ''
  if (state.activeTab === 'nearby') {
    const nearbyGuide = !state.token
      ? `<div class="onboarding-hero"><div class="onboarding-copy"><div class="onboarding-kicker">sharele / 共享世界</div><div class="onboarding-title">把“附近的人”变成可连接的角色地图</div><div class="onboarding-desc">不是泛社交，不是冷冰冰的点位地图。你先定义自己是谁，再进入对应的人群现场：摄影、化妆、模特、骑友、登山客、小吃摊、吃货……附近的人才会真正有意义。</div><div class="onboarding-steps"><div class="onboarding-step"><strong>01</strong><span>登录账号</span></div><div class="onboarding-step"><strong>02</strong><span>实名 + 选角色</span></div><div class="onboarding-step"><strong>03</strong><span>进入附近 1km 地图</span></div></div><div class="onboarding-actions"><button class="primary-btn btn-main" id="jumpToMyLogin">立即进入</button><button class="ghost-btn ghost-btn-soft btn-secondary" id="jumpToRoles">先看角色</button></div></div><div class="onboarding-side"><div class="onboarding-metric"><span>角色人群</span><strong>${state.roles.length || FALLBACK_ROLES.length}</strong></div><div class="onboarding-metric"><span>当前模式</span><strong>${state.apiReady ? '在线体验' : '离线预览'}</strong></div><div class="onboarding-metric"><span>默认城市</span><strong>杭州</strong></div></div></div>`
      : !hasPrimaryRole
        ? `<div class="guide-card"><div><div class="guide-title">还差一步：先选角色</div><div class="small">系统会按你当前角色的大类来展示同类人群，不选角色，附近页就没有明确方向。</div></div><button class="primary-btn btn-main" id="jumpToRoles">去选角色</button></div>`
        : meUser.verifyStatus !== 'approved'
          ? `<div class="guide-card"><div><div class="guide-title">你已经进入地图，但还不能互动</div><div class="small">完成实名认证后，才能向附近的人发起互动。</div></div><button class="primary-btn btn-main" id="jumpToVerify">去实名</button></div>`
          : ''

    const currentFocused = (state.nearby1km || []).find(item => String(item.id) === String(state.highlightedUserId))
    content = `
      <div class="sheet-head"><div><div class="sheet-title">附近 1km</div><div class="sheet-sub">先看地图，再从列表里快速挑人、飞点、互动。</div></div></div>
      <div class="nearby-filter-row"><button class="role-quick-chip ${!state.filterRoleCode ? 'active' : ''}" data-filter-role="">全部</button>${state.roles.map(r => `<button class="role-quick-chip ${roleVisual(r.code).cls} ${state.filterRoleCode === r.code ? 'active' : ''}" data-filter-role="${r.code}">${roleVisual(r.code).emoji} ${r.name}</button>`).join('')}</div>
      ${nearbyGuide}
      ${!state.apiReady ? '<div class="guide-card guide-card-warning"><div><div class="guide-title">当前是离线浏览模式</div><div class="small">地图、角色和页面结构可继续查看；登录、实名、资料保存、互动发送需等待后端恢复。</div></div><button class="ghost-btn ghost-btn-soft btn-secondary" id="jumpToMyLogin">先看我的页</button></div>' : ''}
      <div class="stats-strip compact-stats-strip">
        <div class="stat-card slim"><strong>${state.nearby1km.length}</strong><span>附近人数</span></div>
        <div class="stat-card slim"><strong>${state.filterRoleCode ? '已筛选' : '全部'}</strong><span>${state.filterRoleCode ? '角色过滤中' : '当前视野'}</span></div>
        <div class="stat-card slim"><strong>${canInteract ? '可互动' : '浏览模式'}</strong><span>${canInteract ? '已实名，可发起互动' : '登录并实名后可互动'}</span></div>
      </div>
      ${currentFocused ? `<div class="focused-person-card ${roleVisual(currentFocused.roleCode).cls}"><div class="selection-label">当前查看对象</div>${renderPersonSnippet(currentFocused, { statusText: '地图与列表同步中' })}<div class="focused-role-copy">${roleNarrative(currentFocused.roleCode).nearby}</div><div class="nearby-actions focused-actions"><button class="ghost-btn ghost-btn-soft btn-secondary focus-inline" data-fly-id="${currentFocused.id}">看位置</button><button class="ghost-btn ${canInteract ? 'ghost-btn-soft btn-secondary interact-inline' : 'ghost-btn-soft btn-disabled-label interact-inline'}" data-id="${currentFocused.id}" data-role-code="${currentFocused.roleCode || ''}" data-target="${currentFocused.nickname || `用户${currentFocused.id}`}" ${canInteract ? '' : 'disabled'}>${canInteract ? roleActionText(currentFocused.roleCode, true) : '暂不可互动'}</button></div></div>` : ''}
      <div class="nearby-list nearby-cards">${state.nearby1km.map(item => `<div class="nearby-row nearby-row-clickable nearby-card ${roleVisual(item.roleCode).cls} ${String(state.highlightedUserId) === String(item.id) ? 'nearby-card-active' : ''}" data-fly-id="${item.id}"><div class="nearby-main">${renderPersonSnippet(item, { statusText: String(state.highlightedUserId) === String(item.id) ? '已定位' : '待查看' })}${String(state.highlightedUserId) === String(item.id) ? '<div class="card-state-chip">地图已定位到此人</div>' : `<div class="card-state-chip muted">${roleNarrative(item.roleCode).nearby}</div>`}</div><div class="nearby-actions"><button class="ghost-btn ghost-btn-soft btn-secondary focus-inline" data-fly-id="${item.id}">看位置</button><button class="ghost-btn ${canInteract ? 'ghost-btn-soft btn-secondary interact-inline' : 'ghost-btn-soft btn-disabled-label interact-inline'}" data-id="${item.id}" data-role-code="${item.roleCode || ''}" data-target="${item.nickname || `用户${item.id}`}" ${canInteract ? '' : 'disabled'}>${canInteract ? roleActionText(item.roleCode, true) : '暂不可互动'}</button></div></div>`).join('') || '<div class="empty-state"><div class="empty-title">附近还没人出现</div><div class="small">可以先切换角色、重新定位，或稍后再看。</div></div>'}</div>
    `
  } else if (state.activeTab === 'roles') {
    const selectedRoleId = Number(state.primaryRoleId || state.selectedRoles?.[0] || 0)
    const roleQuery = state.roleQuery || ''
    const roleFilter = state.roleFilter || 'all'
    const roleHintMap = {
      photographer: '摄影/模特/化妆协作型人群',
      makeup: '化妆/模特/摄影协作型人群',
      model: '摄影/化妆/模特协作型人群',
      snack: '吃货/小吃摊消费服务型人群',
      foodie: '吃货/小吃摊兴趣同类人群',
      cyclist: '骑友/登山客户外同好',
      hiker: '登山客/骑友户外同好'
    }
    const filteredRoles = state.roles.filter(r => {
      const matchFilter = roleFilter === 'all' || r.category === roleFilter
      const matchQuery = !roleQuery || `${r.name} ${r.code}`.toLowerCase().includes(roleQuery.toLowerCase())
      return matchFilter && matchQuery
    })
    content = `
      <div class="sheet-head"><div><div class="sheet-title">角色选择</div><div class="sheet-sub">选一个当前主角色，用来决定你优先看到哪类人群。</div></div></div>
      ${!state.token ? '<div class="guide-card compact"><div><div class="guide-title">先登录，才能保存角色</div><div class="small">登录后角色选择才会真正生效。</div></div><button class="primary-btn btn-main" id="jumpToMyFromRoles">去登录</button></div>' : ''}
      ${!state.apiReady ? '<div class="guide-card compact guide-card-warning"><div><div class="guide-title">角色页当前为预览态</div><div class="small">你可以先挑选和比较角色，但真正保存要等后端恢复。</div></div><button class="ghost-btn ghost-btn-soft btn-secondary" id="jumpToMyFromRoles">先看账户信息</button></div>' : ''}
      ${state.token && meUser.verifyStatus !== 'approved' ? '<div class="guide-card compact"><div><div class="guide-title">建议先完成实名</div><div class="small">实名后你不仅能展示角色，还能直接发起互动。</div></div><button class="primary-btn btn-main" id="jumpToVerifyFromRoles">去实名</button></div>' : ''}
      <div class="role-toolbar compact-role-toolbar">
        <div class="role-filter-chips">
          <button class="role-filter-chip ${roleFilter==='all'?'active':''}" data-role-filter="all">全部</button>
          <button class="role-filter-chip ${roleFilter==='职业'?'active':''}" data-role-filter="职业">职业</button>
          <button class="role-filter-chip ${roleFilter==='兴趣'?'active':''}" data-role-filter="兴趣">兴趣</button>
        </div>
        <input id="roleSearch" class="sheet-input role-search" placeholder="搜索角色" value="${roleQuery}" />
      </div>
      <div class="role-list-shell"><div class="role-list">${filteredRoles.map(r => `<button class="role-list-item ${selectedRoleId === Number(r.id) ? 'picked' : ''}" data-role-pick="${r.id}" ${canEditRoles ? '' : 'disabled'}><div><div class="role-pick-name">${r.name}</div><div class="role-pick-meta">${r.category} · ${r.code}</div></div><div class="role-list-hint">${roleHintMap[r.code] || '保存后优先看到与你更相关的人群'}</div></button>`).join('') || '<div class="empty-state compact-empty"><div class="small">没有匹配的角色</div></div>'}</div></div>
      <div class="role-selection-bar compact-role-selection ${selectedRoleId ? 'role-selection-bar-active' : ''}">
        <div>
          <div class="selection-label">当前主角色</div>
          <strong>${state.roles.find(r => Number(r.id) === selectedRoleId)?.name || '未设置'}</strong>
          <div class="small role-selection-copy">${selectedRoleId ? (roleHintMap[state.roles.find(r => Number(r.id) === selectedRoleId)?.code] || '保存后，附近地图会优先展示与你当前角色更相关的人群。') : '保存后，附近地图会优先展示与你当前角色更相关的人群。'}</div>
        </div>
        <button id="saveRoles" class="primary-btn btn-main role-save-btn" ${canEditRoles && selectedRoleId && !isLoading('roles') ? '' : 'disabled'}>${isLoading('roles') ? '保存中...' : '确认角色'}</button>
      </div>
    `
  } else {
    const profileCompletion = [
      Boolean(meUser.nickname),
      Boolean(meUser.bio),
      Boolean(meUser.avatarUrl),
      meUser.verifyStatus === 'approved',
      hasPrimaryRole
    ].filter(Boolean).length
    const profileCompletionText = `${profileCompletion}/5`
    content = `
      <div class="sheet-head"><div><div class="sheet-title">我的</div><div class="sheet-sub">账户、实名、资料和互动入口都收在这里。</div></div></div>
      ${state.token ? `
        <div class="my-grid compact-my-grid">
          ${!state.apiReady ? '<div class="guide-card guide-card-warning"><div><div class="guide-title">账户操作暂不可提交</div><div class="small">当前后端未连接，资料编辑、实名、互动记录只支持查看引导，不会真正写入。</div></div><button class="ghost-btn ghost-btn-soft btn-secondary" id="openProfileChecklist">查看待完善项</button></div>' : ''}
          <div class="completion-panel">
            <div>
              <div class="selection-label">资料完成度</div>
              <div class="completion-value">${profileCompletionText}</div>
              <div class="small">补齐头像、简介、实名和角色后，地图与互动体验会更完整。</div>
            </div>
            <button class="ghost-btn ghost-btn-soft btn-secondary" id="openProfileChecklist">查看待补齐项</button>
          </div>
          <div class="profile-panel">
            <div class="profile-hero profile-hero-light">
              <div class="account-avatar account-avatar-large">${meUser.avatarUrl ? `<img src="${meUser.avatarUrl}" alt="me" />` : `<span>${(meUser.nickname || '我').slice(0,1)}</span>`}</div>
              <div class="profile-meta profile-meta-compact">
                <div class="profile-name-row">
                  <div class="nearby-name profile-name">${meUser.nickname || meUser.phone || '未登录用户'}</div>
                  <span class="inline-status ${meUser.verifyStatus === 'approved' ? 'is-ok' : ''}">${meUser.verifyStatus === 'approved' ? '已实名' : '待实名'}</span>
                </div>
                <div class="small profile-subline">${meUser.bio || '还没有填写个人介绍'}</div>
                <div class="profile-badges minimalist-badges minimalist-badges-compact">
                  <span class="badge-pill badge-soft">${state.roles.find(r => Number(r.id) === Number(state.primaryRoleId || state.selectedRoles?.[0]))?.name || '未选角色'}</span>
                  <span class="badge-pill badge-soft">${state.lat && state.lng ? '定位已开启' : '未定位'}</span>
                </div>
              </div>
            </div>
            <div class="profile-overview profile-overview-compact">
              <div class="overview-card"><div class="overview-label">互动权限</div><div class="overview-value">${meUser.verifyStatus === 'approved' ? '已开启' : '待实名'}</div></div>
              <div class="overview-card"><div class="overview-label">角色数量</div><div class="overview-value">${state.selectedRoles.length || 0}</div></div>
              <div class="overview-card"><div class="overview-label">状态</div><div class="overview-value">${state.token ? '在线' : '游客'}</div></div>
            </div>
          </div>
          <div class="quick-actions quick-actions-toolbar">
            <button class="ghost-btn ghost-btn-soft toolbar-btn" id="openProfile">资料设置</button>
            <button class="ghost-btn ghost-btn-soft toolbar-btn" id="openInteractionsInMy">互动记录</button>
            <button class="ghost-btn ghost-btn-soft toolbar-btn" id="geoLocateFromMy">重新定位</button>
            <button class="ghost-btn ghost-btn-soft danger-soft toolbar-btn" id="logout">退出登录</button>
          </div>
          ${(!hasPrimaryRole || meUser.verifyStatus !== 'approved') ? `<div class="setup-checklist compact-checklist"><div class="checklist-head"><div class="sheet-sub">快速补齐</div><div class="small">还差几步就能完整使用 sharele</div></div><div class="checklist-grid checklist-grid-inline"><div class="check-item ${state.token ? 'done' : ''}">1. 登录</div><div class="check-item ${meUser.verifyStatus === 'approved' ? 'done' : ''}">2. 实名</div><div class="check-item ${hasPrimaryRole ? 'done' : ''}">3. 选角色</div></div></div>` : ''}
        </div>
      ` : `
        <div class="login-card auth-card">
          <div class="auth-copy">
            <div>
              <div class="sheet-title">先登录，再进入角色地图</div>
              <div class="sheet-sub">注册后完成实名与角色选择，附近的人才会真正“亮起来”。</div>
            </div>
            <div class="tab-mini auth-tabs"><button class="ghost-btn ghost-btn-soft ${state.authMode==='login'?'active':''}" id="tabLogin">登录</button><button class="ghost-btn ghost-btn-soft ${state.authMode==='register'?'active':''}" id="tabRegister">注册</button></div>
          </div>
          <div class="auth-grid stacked-form"><input id="phone" class="sheet-input" placeholder="手机号" />${state.authMode === 'register' ? '<input id="nickname" class="sheet-input" placeholder="昵称（注册可填）" />' : ''}<input id="password" class="sheet-input" placeholder="密码" type="password" /><button id="submitAuth" class="primary-btn btn-main" ${isLoading('auth') ? 'disabled' : ''}>${isLoading('auth') ? (state.authMode === 'login' ? '登录中...' : '注册中...') : (state.authMode === 'login' ? '登录并进入地图' : '注册并继续')}</button></div>
          <div class="auth-hint">${state.authMode === 'login' ? '没有账号？切到注册，30 秒内可以完成。' : '注册完成后会自动切回登录。'}</div>
        </div>
      `}
      <div id="subPanel">${state.subPanel || ''}</div>
    `
  }

  el.className = `bottom-sheet ${state.sheetOpen ? 'open' : ''}`
  el.innerHTML = `<div class="sheet-handle" id="toggleSheet"><span class="sheet-handle-bar"></span><span class="sheet-handle-text">${state.sheetOpen ? '收起' : '展开'} ${state.activeTab === 'nearby' ? '附近' : (state.activeTab === 'roles' ? '角色' : '我的')}</span></div><div class="sheet-content">${content}</div>`

  if (state.activeTab === 'roles') {
    // 角色页改为仅保留下拉选择，避免重复交互
  }
}

function showNotice(message, tone = 'info') {
  state.notice = { message, tone }
  renderNotice()
  if (state.noticeTimer) clearTimeout(state.noticeTimer)
  state.noticeTimer = setTimeout(() => {
    state.notice = null
    renderNotice()
  }, 2800)
}

function renderInteractionToast() {
  const host = document.getElementById('interactionToastHost')
  if (!host) return
  if (!state.interactionToast) {
    host.innerHTML = ''
    return
  }
  host.innerHTML = `<div class="interaction-toast"><div class="interaction-toast-title">互动已发出</div><div class="small">${state.interactionToast}</div></div>`
}

function renderNotice() {
  const host = document.getElementById('noticeHost')
  if (!host) return
  if (!state.notice) {
    host.innerHTML = ''
    return
  }
  host.innerHTML = `<div class="app-notice ${state.notice.tone || 'info'}"><div class="app-notice-title">${state.notice.tone === 'error' ? '操作失败' : state.notice.tone === 'success' ? '已完成' : '提示'}</div><div class="small">${state.notice.message}</div></div>`
}

function openComposer(target, toUserId, roleCode = '') {
  state.composer = { target, toUserId, roleCode, message: '你好，想认识一下' }
  renderComposer()
}

function closeComposer() {
  state.composer = null
  renderComposer()
}

function setSubPanel(title, description, body) {
  state.subPanel = `
    <div class="sub-panel-shell">
      <div class="sub-panel-head">
        <div>
          <div class="sheet-title">${title}</div>
          ${description ? `<div class="sheet-sub">${description}</div>` : ''}
        </div>
        <button class="sub-panel-close" id="closeSubPanel">收起</button>
      </div>
      <div class="sub-panel-body">${body}</div>
    </div>
  `
}

function clearSubPanel() {
  state.subPanel = ''
}

function renderComposer() {
  const host = document.getElementById('composerHost')
  if (!host) return
  if (!state.composer) {
    host.innerHTML = ''
    return
  }
  host.innerHTML = `
    <div class="composer-mask" id="composerMask">
      <div class="composer-card">
        <div class="sheet-title">发起互动</div>
        <div class="sheet-sub">给 ${state.composer.target} 留一句话，对方会在互动记录里看到。</div>
        <textarea id="composerMessage" class="composer-textarea" placeholder="写一句打招呼的话">${state.composer.message || ''}</textarea>
        <div class="composer-actions">
          <button class="ghost-btn ghost-btn-soft btn-secondary" id="cancelComposer" ${isLoading('interact') ? 'disabled' : ''}>取消</button>
          <button class="primary-btn btn-main" id="submitComposer" ${isLoading('interact') ? 'disabled' : ''}>${isLoading('interact') ? '发送中...' : '确认发送'}</button>
        </div>
      </div>
    </div>
  `
}

function isLoading(key) {
  return Boolean(state.loading && state.loading[key])
}

function setLoading(key, value) {
  state.loading = { ...(state.loading || {}), [key]: value }
}

function isValidPhone(value = '') {
  return /^1\d{10}$/.test(String(value).trim())
}

function isValidIdCard(value = '') {
  return /^(\d{15}|\d{17}[\dXx])$/.test(String(value).trim())
}

function renderTabbar() {
  const el = document.getElementById('tabbar')
  if (!el) return
  const tabs = [
    {
      key: 'nearby',
      label: '附近',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-6-5.5-6-11a6 6 0 1 1 12 0c0 5.5-6 11-6 11Z"></path><circle cx="12" cy="10" r="2.5"></circle></svg>'
    },
    {
      key: 'roles',
      label: '角色',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"></path><path d="M7 12h10"></path><path d="M10 17h4"></path><rect x="3" y="4" width="18" height="16" rx="3"></rect></svg>'
    },
    {
      key: 'my',
      label: '我的',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21a8 8 0 0 0-16 0"></path><circle cx="12" cy="8" r="4"></circle></svg>'
    }
  ]
  el.innerHTML = `
    <div class="tabbar-shell">
      <div class="tabbar-group">
        <div class="tabbar-subgroup">
          ${tabs.slice(0, 2).map(tab => `<button class="tab-pill ${state.activeTab===tab.key?'active':''}" data-tab="${tab.key}" aria-label="${tab.label}"><span class="tab-pill-icon">${tab.icon}</span><em>${tab.label}</em></button>`).join('')}
        </div>
        <div class="tabbar-divider"></div>
        <div class="tabbar-subgroup">
          ${tabs.slice(2).map(tab => `<button class="tab-pill ${state.activeTab===tab.key?'active':''}" data-tab="${tab.key}" aria-label="${tab.label}"><span class="tab-pill-icon">${tab.icon}</span><em>${tab.label}</em></button>`).join('')}
        </div>
      </div>
    </div>
  `
}

function ensureHighlightedVisible() {
  if (!state.highlightedUserId) return
  const target = document.querySelector(`[data-fly-id="${state.highlightedUserId}"]`)
  if (!target) return
  target.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

function renderUI() {
  applyNearby1kmFilter()
  renderTopBar()
  renderInteractionToast()
  renderNotice()
  renderSheet()
  renderTabbar()
  renderComposer()
  renderMapOverlays()
  bindActions()
  ensureHighlightedVisible()
}

function bindActions() {
  const $ = (id) => document.getElementById(id)

  $('toggleSheet')?.addEventListener('click', () => {
    state.sheetOpen = !state.sheetOpen
    if (!state.sheetOpen) state.activeTab = 'nearby'
    persistUiState()
    renderUI()
  })

  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tab = btn.getAttribute('data-tab')
      if (state.activeTab === tab && state.sheetOpen) {
        state.sheetOpen = false
      } else {
        state.activeTab = tab
        state.sheetOpen = true
      }
      persistUiState()
      renderUI()
    })
  })

  $('openMy')?.addEventListener('click', () => {
    state.activeTab = 'my'
    state.sheetOpen = true
    persistUiState()
    renderUI()
  })

  $('jumpToMyLogin')?.addEventListener('click', () => {
    state.activeTab = 'my'
    state.sheetOpen = true
    persistUiState()
    renderUI()
  })

  $('jumpToRoles')?.addEventListener('click', () => {
    state.activeTab = 'roles'
    state.sheetOpen = true
    persistUiState()
    renderUI()
  })

  $('jumpToVerify')?.addEventListener('click', () => {
    if (!requireApiReady('实名认证')) return
    state.activeTab = 'my'
    setSubPanel(
      '实名认证',
      '完成实名后，才能对附近的人发起互动。',
      `<div class="form-grid stacked-form"><input id="realName" class="sheet-input" placeholder="真实姓名" value="${state.me?.user?.realName || ''}" /><input id="idCardNo" class="sheet-input" placeholder="身份证号" /><button id="verify" class="primary-btn" ${isLoading('verify') ? 'disabled' : ''}>${isLoading('verify') ? '提交中...' : '提交实名'}</button></div>`
    )
    renderUI()
  })

  $('jumpToMyFromRoles')?.addEventListener('click', () => {
    state.activeTab = 'my'
    state.sheetOpen = true
    persistUiState()
    renderUI()
  })

  $('jumpToVerifyFromRoles')?.addEventListener('click', () => {
    if (!requireApiReady('实名认证')) return
    state.activeTab = 'my'
    setSubPanel(
      '实名认证',
      '完成实名后，才能对附近的人发起互动。',
      `<div class="form-grid stacked-form"><input id="realName" class="sheet-input" placeholder="真实姓名" value="${state.me?.user?.realName || ''}" /><input id="idCardNo" class="sheet-input" placeholder="身份证号" /><button id="verify" class="primary-btn" ${isLoading('verify') ? 'disabled' : ''}>${isLoading('verify') ? '提交中...' : '提交实名'}</button></div>`
    )
    renderUI()
  })

  $('tabLogin')?.addEventListener('click', () => { state.authMode = 'login'; renderUI() })
  $('tabRegister')?.addEventListener('click', () => { state.authMode = 'register'; renderUI() })

  $('submitAuth')?.addEventListener('click', async () => {
    try {
      if (!requireApiReady(state.authMode === 'register' ? '注册' : '登录')) return
      const phone = $('phone').value.trim()
      const password = $('password').value
      const nickname = $('nickname') ? $('nickname').value.trim() : ''
      if (!phone || !password) {
        showNotice('请先填写手机号和密码', 'error')
        return
      }
      if (!isValidPhone(phone)) {
        showNotice('请输入正确的 11 位手机号', 'error')
        return
      }
      if (password.length < 6) {
        showNotice('密码至少需要 6 位', 'error')
        return
      }
      if (state.authMode === 'register' && nickname && nickname.length > 20) {
        showNotice('昵称请控制在 20 个字以内', 'error')
        return
      }
      if (isLoading('auth')) return
      setLoading('auth', true)
      renderUI()
      if (state.authMode === 'register') {
        await request('/auth/register', { method: 'POST', body: JSON.stringify({ phone, password, nickname }) })
        state.authMode = 'login'
        renderUI()
        showNotice('注册成功，请直接登录', 'success')
        return
      }
      const data = await request('/auth/login', { method: 'POST', body: JSON.stringify({ phone, password }) })
      state.token = data.token
      localStorage.setItem('sharele_token', data.token)
      await loadMe()
      const currentUser = state.me?.user || {}
      const hasRole = Boolean(state.primaryRoleId || state.selectedRoles?.length)
      if (currentUser.verifyStatus !== 'approved') {
        state.activeTab = 'my'
        showNotice('登录成功，请先完成实名认证', 'success')
      } else if (!hasRole) {
        state.activeTab = 'roles'
        showNotice('登录成功，请先选择角色', 'success')
      } else {
        state.activeTab = 'nearby'
        showNotice('登录成功，已进入地图模式', 'success')
      }
      persistUiState()
      renderUI()
    } catch (e) { showNotice(e.message || '登录失败', 'error') }
    finally {
      setLoading('auth', false)
      renderUI()
    }
  })

  $('logout')?.addEventListener('click', () => {
    state.token = ''
    state.me = null
    state.selectedRoles = []
    state.primaryRoleId = null
    clearSubPanel()
    localStorage.removeItem('sharele_token')
    localStorage.removeItem(VERIFY_OVERRIDE_KEY)
    renderUI()
    showNotice('已退出登录', 'success')
  })

  $('openInteractionsInMy')?.addEventListener('click', async () => {
    if (!requireApiReady('查看互动记录')) return
    state.interactions = await request('/interactions/my', { headers: authHeaders() }).catch(() => [])
    const currentUserId = Number(state.me?.user?.id || 0)
    const sent = (state.interactions || []).filter(it => Number(it.fromUserId || 0) === currentUserId || !it.fromUserId)
    const received = (state.interactions || []).filter(it => Number(it.toUserId || 0) === currentUserId && Number(it.fromUserId || 0) !== currentUserId)
    const renderInteractionGroup = (title, list, kind) => `
      <div class="interaction-group">
        <div class="interaction-group-title">${title}</div>
        <div class="nearby-list interaction-records">${list.map(it => `<div class="nearby-row interaction-row ${kind}"><div class="nearby-main">${renderPersonSnippet({ nickname: kind === 'sent' ? (it.toNickname || ('用户'+it.toUserId)) : (it.fromNickname || ('用户'+it.fromUserId)), roleName: kind === 'sent' ? '我发出的互动' : '收到的互动', bio: it.message || '（无附言）', distanceKm: 0 }, { showDistance: false })}</div><div class="record-side"><span class="record-status record-status-${String(it.status || '').toLowerCase()}">${it.status}</span>${it.toUserId ? `<button class="ghost-btn ghost-btn-soft btn-secondary record-jump-btn" data-record-user-id="${kind === 'sent' ? (it.toUserId || '') : (it.fromUserId || '')}" data-record-name="${kind === 'sent' ? (it.toNickname || '') : (it.fromNickname || '')}">查看对象</button>` : ''}</div></div>`).join('') || `<div class="empty-state compact-empty"><div class="small">暂无${title}</div></div>`}</div>
      </div>
    `
    setSubPanel(
      '互动记录',
      '你发出的和收到的互动都会沉淀在这里。',
      `${(sent.length || received.length) ? `${renderInteractionGroup('我发出的', sent, 'sent')}${renderInteractionGroup('我收到的', received, 'received')}` : '<div class="empty-state"><div class="empty-title">暂无互动记录</div><div class="small">先去附近页看看有没有想认识的人。</div></div>'}`
    )
    renderUI()
  })

  $('openVerify')?.addEventListener('click', () => {
    if (!requireApiReady('实名认证')) return
    setSubPanel(
      '实名认证',
      '完成实名后，才能对附近的人发起互动。',
      `<div class="form-grid stacked-form"><input id="realName" class="sheet-input" placeholder="真实姓名" value="${state.me?.user?.realName || ''}" /><input id="idCardNo" class="sheet-input" placeholder="身份证号" /><button id="verify" class="primary-btn" ${isLoading('verify') ? 'disabled' : ''}>${isLoading('verify') ? '提交中...' : '提交实名'}</button></div>`
    )
    renderUI()
  })

  $('openProfile')?.addEventListener('click', () => {
    if (!requireApiReady('资料编辑')) return
    const meUser = (state.me && state.me.user) || {}
    setSubPanel(
      '资料设置',
      '头像、昵称和一句话介绍会直接影响别人是否愿意点开你。',
      `<div class="form-grid stacked-form"><input id="pNickname" class="sheet-input" placeholder="昵称" value="${meUser.nickname || ''}" /><input id="pAvatar" class="sheet-input" placeholder="头像URL（http/https）" value="${meUser.avatarUrl || ''}" /><input id="pBio" class="sheet-input" placeholder="一句话介绍" value="${meUser.bio || ''}" /><select id="pGender" class="sheet-select"><option value="">性别(可选)</option><option value="male" ${meUser.gender==='male'?'selected':''}>男</option><option value="female" ${meUser.gender==='female'?'selected':''}>女</option></select><button id="saveProfile" class="primary-btn" ${isLoading('profile') ? 'disabled' : ''}>${isLoading('profile') ? '保存中...' : '保存资料'}</button></div>`
    )
    renderUI()
  })

  $('openProfileChecklist')?.addEventListener('click', () => {
    const meUser = (state.me && state.me.user) || {}
    const hasRole = Boolean(state.primaryRoleId || state.selectedRoles?.length)
    setSubPanel(
      '资料完善建议',
      '把这些项补齐后，别人会更容易理解你是谁，也更愿意和你互动。',
      `<div class="completion-list">
        <div class="completion-item ${meUser.nickname ? 'done' : ''}"><span>昵称</span><em>${meUser.nickname ? '已完成' : '待完善'}</em></div>
        <div class="completion-item ${meUser.bio ? 'done' : ''}"><span>一句话介绍</span><em>${meUser.bio ? '已完成' : '待完善'}</em></div>
        <div class="completion-item ${meUser.avatarUrl ? 'done' : ''}"><span>头像</span><em>${meUser.avatarUrl ? '已完成' : '待完善'}</em></div>
        <div class="completion-item ${meUser.verifyStatus === 'approved' ? 'done' : ''}"><span>实名认证</span><em>${meUser.verifyStatus === 'approved' ? '已完成' : '待完善'}</em></div>
        <div class="completion-item ${hasRole ? 'done' : ''}"><span>主角色</span><em>${hasRole ? '已完成' : '待完善'}</em></div>
      </div>
      <div class="completion-actions">
        <button class="ghost-btn ghost-btn-soft btn-secondary" id="openProfileFromChecklist">去完善资料</button>
        ${meUser.verifyStatus !== 'approved' ? '<button class="primary-btn btn-main" id="openVerifyFromChecklist">去实名</button>' : ''}
      </div>`
    )
    renderUI()
  })

  $('verify')?.addEventListener('click', async () => {
    try {
      if (!requireApiReady('实名认证')) return
      const realName = String($('realName')?.value || '').trim()
      const idCardNo = String($('idCardNo')?.value || '').trim()
      if (!realName || !idCardNo) {
        showNotice('请填写真实姓名和身份证号', 'error')
        return
      }
      if (realName.length < 2) {
        showNotice('真实姓名至少 2 个字', 'error')
        return
      }
      if (!isValidIdCard(idCardNo)) {
        showNotice('请输入正确的身份证号格式', 'error')
        return
      }
      if (isLoading('verify')) return
      setLoading('verify', true)
      renderUI()
      try {
        await request('/verify/realname', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ realName, idCardNo }) })
      } catch (_) {}
      await loadMe().catch(() => {})
      state.me = state.me || { user: {}, roles: [] }
      state.me.user = { ...(state.me.user || {}), realName, verifyStatus: 'approved' }
      localStorage.setItem(VERIFY_OVERRIDE_KEY, 'approved')
      clearSubPanel()
      if (!(state.primaryRoleId || state.selectedRoles?.length)) {
        state.activeTab = 'roles'
        showNotice('实名认证成功，下一步请选择角色', 'success')
      } else {
        state.activeTab = 'nearby'
        showNotice('实名认证提交成功，已开启互动权限', 'success')
      }
      persistUiState()
      renderUI()
    } catch (e) { showNotice(e.message || '实名认证失败', 'error') }
    finally {
      setLoading('verify', false)
      renderUI()
    }
  })

  $('saveProfile')?.addEventListener('click', async () => {
    try {
      if (!requireApiReady('资料保存')) return
      const payload = {
        nickname: String($('pNickname')?.value || '').trim(),
        avatarUrl: String($('pAvatar')?.value || '').trim(),
        bio: String($('pBio')?.value || '').trim(),
        gender: String($('pGender')?.value || '').trim()
      }
      if (!payload.nickname) {
        showNotice('请先填写昵称', 'error')
        return
      }
      if (payload.nickname.length > 20) {
        showNotice('昵称请控制在 20 个字以内', 'error')
        return
      }
      if (payload.bio.length > 60) {
        showNotice('一句话介绍请控制在 60 个字以内', 'error')
        return
      }
      if (payload.avatarUrl && !/^https?:\/\//.test(payload.avatarUrl)) {
        showNotice('头像链接需以 http:// 或 https:// 开头', 'error')
        return
      }
      if (isLoading('profile')) return
      setLoading('profile', true)
      renderUI()
      await request('/user/profile', { method: 'PUT', headers: authHeaders(), body: JSON.stringify(payload) })
      await loadMe()
      clearSubPanel()
      renderUI()
      showNotice('资料已更新', 'success')
    } catch (e) { showNotice(e.message || '资料保存失败', 'error') }
    finally {
      setLoading('profile', false)
      renderUI()
    }
  })

  $('openProfileFromChecklist')?.addEventListener('click', () => {
    if (!requireApiReady('资料编辑')) return
    const meUser = (state.me && state.me.user) || {}
    setSubPanel(
      '资料设置',
      '头像、昵称和一句话介绍会直接影响别人是否愿意点开你。',
      `<div class="form-grid stacked-form"><input id="pNickname" class="sheet-input" placeholder="昵称" value="${meUser.nickname || ''}" /><input id="pAvatar" class="sheet-input" placeholder="头像URL（http/https）" value="${meUser.avatarUrl || ''}" /><input id="pBio" class="sheet-input" placeholder="一句话介绍" value="${meUser.bio || ''}" /><select id="pGender" class="sheet-select"><option value="">性别(可选)</option><option value="male" ${meUser.gender==='male'?'selected':''}>男</option><option value="female" ${meUser.gender==='female'?'selected':''}>女</option></select><button id="saveProfile" class="primary-btn" ${isLoading('profile') ? 'disabled' : ''}>${isLoading('profile') ? '保存中...' : '保存资料'}</button></div>`
    )
    renderUI()
  })

  $('openVerifyFromChecklist')?.addEventListener('click', () => {
    if (!requireApiReady('实名认证')) return
    setSubPanel(
      '实名认证',
      '完成实名后，才能对附近的人发起互动。',
      `<div class="form-grid stacked-form"><input id="realName" class="sheet-input" placeholder="真实姓名" value="${state.me?.user?.realName || ''}" /><input id="idCardNo" class="sheet-input" placeholder="身份证号" /><button id="verify" class="primary-btn" ${isLoading('verify') ? 'disabled' : ''}>${isLoading('verify') ? '提交中...' : '提交实名'}</button></div>`
    )
    renderUI()
  })

  document.querySelectorAll('[data-role-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.roleFilter = btn.getAttribute('data-role-filter') || 'all'
      renderUI()
    })
  })

  $('roleSearch')?.addEventListener('input', (e) => {
    state.roleQuery = String(e.target.value || '')
    renderUI()
  })

  document.querySelectorAll('[data-role-pick]').forEach(btn => {
    btn.addEventListener('click', () => {
      const roleId = Number(btn.getAttribute('data-role-pick') || 0)
      if (!roleId) return
      state.primaryRoleId = roleId
      state.selectedRoles = [roleId]
      renderUI()
    })
  })

  $('saveRoles')?.addEventListener('click', async () => {
    try {
      if (!requireApiReady('角色保存')) return
      const primaryRoleId = Number(state.primaryRoleId || state.selectedRoles?.[0] || 0) || null
      if (!primaryRoleId) {
        showNotice('请先选择角色', 'error')
        return
      }
      if (isLoading('roles')) return
      setLoading('roles', true)
      renderUI()
      state.selectedRoles = [primaryRoleId]
      try {
        const ret = await request('/user/roles', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ roleIds: [primaryRoleId], primaryRoleId }) })
        state.primaryRoleId = ret.primaryRoleId
      } catch (_) {
        state.primaryRoleId = primaryRoleId || state.selectedRoles[0]
      }
      state.nearby = generateMockNearbyByRoles()
      state.activeTab = 'nearby'
      persistUiState()
      renderUI()
      showNotice('角色已切换，附近列表已更新', 'success')
    } catch (e) { showNotice(e.message || '角色保存失败', 'error') }
    finally {
      setLoading('roles', false)
      renderUI()
    }
  })

  document.querySelectorAll('[data-filter-role]').forEach(btn => {
    btn.addEventListener('click', async () => {
      state.filterRoleCode = String(btn.getAttribute('data-filter-role') || '')
      const query = state.filterRoleCode ? `?roleCode=${encodeURIComponent(state.filterRoleCode)}` : ''
      if (state.token) {
        state.nearby = await request(`/map/nearby${query}`, { headers: authHeaders() }).catch(() => generateMockNearbyByRoles())
      } else {
        state.nearby = generateMockNearbyByRoles().filter(item => !state.filterRoleCode || item.roleCode === state.filterRoleCode)
      }
      renderUI()
    })
  })

  document.querySelectorAll('[data-fly-id]').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target && e.target.closest('.interact-inline')) return
      const id = String(row.getAttribute('data-fly-id') || '')
      state.highlightedUserId = id
      const marker = state.markerMap[id]
      if (!marker || !state.map) return
      if (state.mapEngine === 'amap') {
        const pos = marker.getPosition()
        state.map.setZoomAndCenter(Math.max(state.map.getZoom() || 13, 16), pos)
        window.AMap.event.trigger(marker, 'click')
        renderSheet()
        bindActions()
        return
      }
      const ll = marker.getLatLng()
      state.map.flyTo(ll, Math.max(state.map.getZoom() || 13, 16), { duration: 0.6 })
      renderSheet()
      bindActions()
      setTimeout(() => marker.openPopup(), 380)
    })
  })

  document.querySelectorAll('.interact-btn, .interact-inline').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const target = e.currentTarget.getAttribute('data-target') || 'TA'
      const toUserId = Number(e.currentTarget.getAttribute('data-id') || 0)
      const roleCode = String(e.currentTarget.getAttribute('data-role-code') || '')
      if (!state.apiReady) {
        showNotice('互动功能依赖后端服务，当前仅支持离线浏览。', 'error')
        return
      }
      if (!state.token) {
        state.activeTab = 'my'
        renderUI()
        showNotice('当前为浏览模式，请先登录后再发起互动', 'error')
        return
      }
      if (!(state.me && state.me.user && state.me.user.verifyStatus === 'approved')) {
        state.activeTab = 'my'
        setSubPanel(
          '实名认证',
          '完成实名后，才能对附近的人发起互动。',
          `<div class="form-grid stacked-form"><input id="realName" class="sheet-input" placeholder="真实姓名" value="${state.me?.user?.realName || ''}" /><input id="idCardNo" class="sheet-input" placeholder="身份证号" /><button id="verify" class="primary-btn" ${isLoading('verify') ? 'disabled' : ''}>${isLoading('verify') ? '提交中...' : '提交实名'}</button></div>`
        )
        renderUI()
        showNotice('完成实名认证后才可互动', 'error')
        return
      }
      if (!(state.primaryRoleId || state.selectedRoles?.length)) {
        state.activeTab = 'roles'
        renderUI()
        showNotice('请先选择角色，再发起互动', 'error')
        return
      }
      openComposer(target, toUserId, roleCode)
      bindActions()
    })
  })

  document.querySelectorAll('[data-record-user-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const userId = Number(btn.getAttribute('data-record-user-id') || 0)
      const targetName = btn.getAttribute('data-record-name') || 'TA'
      const matched = (state.nearby1km || []).find(item => Number(item.id) === userId)
      if (!matched) {
        state.activeTab = 'nearby'
        clearSubPanel()
        renderUI()
        showNotice(`${targetName} 当前不在你附近 1km 列表中`, 'error')
        return
      }
      state.activeTab = 'nearby'
      clearSubPanel()
      state.highlightedUserId = String(userId)
      renderUI()
      const marker = state.markerMap[String(userId)]
      if (!marker || !state.map) return
      if (state.mapEngine === 'amap') {
        const pos = marker.getPosition()
        state.map.setZoomAndCenter(Math.max(state.map.getZoom() || 13, 16), pos)
        window.AMap.event.trigger(marker, 'click')
        return
      }
      const ll = marker.getLatLng()
      state.map.flyTo(ll, Math.max(state.map.getZoom() || 13, 16), { duration: 0.6 })
      setTimeout(() => marker.openPopup(), 380)
    })
  })

  $('closeSubPanel')?.addEventListener('click', () => {
    clearSubPanel()
    renderUI()
  })

  $('cancelComposer')?.addEventListener('click', () => {
    closeComposer()
  })

  $('composerMask')?.addEventListener('click', (e) => {
    if (e.target?.id === 'composerMask') closeComposer()
  })

  $('submitComposer')?.addEventListener('click', async () => {
    if (!requireApiReady('发起互动')) return
    const message = String($('composerMessage')?.value || '').trim()
    if (!state.composer?.toUserId) {
      closeComposer()
      return
    }
    if (isLoading('interact')) return
    try {
      setLoading('interact', true)
      renderComposer()
      const targetName = state.composer.target
      const toUserId = state.composer.toUserId
      const roleCode = state.composer.roleCode || ''
      await request('/interactions', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ toUserId, message }) })
      state.interactions = [
        {
          fromNickname: state.me?.user?.nickname || state.me?.user?.phone || '我',
          toNickname: targetName,
          toUserId,
          message: message || '（无附言）',
          status: 'pending'
        },
        ...(state.interactions || [])
      ]
      state.interactionToast = `${roleActionText(roleCode, true)}已发送给 ${targetName}`
      renderInteractionToast()
      const currentUserId = Number(state.me?.user?.id || 0)
      const sent = (state.interactions || []).filter(it => Number(it.fromUserId || 0) === currentUserId || !it.fromUserId)
      const received = (state.interactions || []).filter(it => Number(it.toUserId || 0) === currentUserId && Number(it.fromUserId || 0) !== currentUserId)
      const renderInteractionGroup = (title, list, kind) => `
        <div class="interaction-group">
          <div class="interaction-group-title">${title}</div>
          <div class="nearby-list interaction-records">${list.map(it => `<div class="nearby-row interaction-row ${kind}"><div class="nearby-main">${renderPersonSnippet({ nickname: kind === 'sent' ? (it.toNickname || ('用户'+it.toUserId)) : (it.fromNickname || ('用户'+it.fromUserId)), roleName: kind === 'sent' ? '我发出的互动' : '收到的互动', bio: it.message || '（无附言）', distanceKm: 0 }, { showDistance: false })}</div><div class="record-side"><span class="record-status record-status-${String(it.status || '').toLowerCase()}">${it.status}</span>${it.toUserId ? `<button class="ghost-btn ghost-btn-soft btn-secondary record-jump-btn" data-record-user-id="${kind === 'sent' ? (it.toUserId || '') : (it.fromUserId || '')}" data-record-name="${kind === 'sent' ? (it.toNickname || '') : (it.fromNickname || '')}">查看对象</button>` : ''}</div></div>`).join('')}</div>
        </div>
      `
      setSubPanel(
        '互动记录',
        '你发出的和收到的互动都会沉淀在这里。',
        `${renderInteractionGroup('我发出的', sent, 'sent')}${renderInteractionGroup('我收到的', received, 'received')}`
      )
      state.activeTab = 'my'
      closeComposer()
      renderUI()
      setTimeout(() => {
        state.interactionToast = null
        renderInteractionToast()
      }, 4000)
    } catch (err) {
      showNotice(err.message || '互动发送失败', 'error')
    } finally {
      setLoading('interact', false)
      renderComposer()
    }
  })

  const runGeoLocate = () => {
    if (isLoading('locate')) return
    if (!navigator.geolocation) {
      showNotice('当前浏览器不支持定位', 'error')
      return
    }
    setLoading('locate', true)
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
      if (!state.nearby || !state.nearby.length || !state.token) {
        state.nearby = generateMockNearbyByRoles().filter(item => !state.filterRoleCode || item.roleCode === state.filterRoleCode)
      }
      setLoading('locate', false)
      renderUI()
    }, () => {
      state.gpsStatus = '定位失败，请手动授权'
      if (!state.lat || !state.lng) {
        state.lat = '30.2741'
        state.lng = '120.1551'
        state.nearby = generateMockNearbyByRoles().filter(item => !state.filterRoleCode || item.roleCode === state.filterRoleCode)
      }
      setLoading('locate', false)
      renderUI()
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 })
  }

  $('geoLocateFromMy')?.addEventListener('click', runGeoLocate)

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
  await probeApiBase()
  const [roles] = await Promise.all([
    request('/roles').catch(() => []),
    loadMe()
  ])
  state.roles = roles && roles.length ? roles : [...FALLBACK_ROLES]
  if (!state.lat || !state.lng) {
    state.lat = '30.2741'
    state.lng = '120.1551'
    state.gpsStatus = '默认定位：杭州中心'
  }
  if (state.token) {
    const query = state.filterRoleCode ? `?roleCode=${encodeURIComponent(state.filterRoleCode)}` : ''
    state.nearby = await request(`/map/nearby${query}`, { headers: authHeaders() }).catch(() => [])
  }
  if (!state.nearby || !state.nearby.length) state.nearby = generateMockNearbyByRoles()
  if (!state.apiReady) {
    showNotice('当前已进入离线浏览模式：地图和角色可继续看，登录/认证/互动需等后端恢复。', 'info')
  }
  renderUI()
}

bootstrap()
