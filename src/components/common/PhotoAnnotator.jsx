import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import { useToast, useConfirm } from './Toast.jsx'

const COLORS = [
  { key: 'red',    value: '#EF4444' },
  { key: 'yellow', value: '#F59E0B' },
  { key: 'green',  value: '#10B981' },
  { key: 'blue',   value: '#3D70B2' },
  { key: 'black',  value: '#111827' },
  { key: 'white',  value: '#FFFFFF' },
]

// Preset thickness in *screen CSS pixels at fit-zoom*. On draw we convert to
// absolute image-space px (÷ fitScale) and store that on the shape, so an
// annotation keeps a fixed real thickness on the photo regardless of zoom.
const WIDTHS = [
  { key: 'thin',   px: 6,  label: 'Cienka' },
  { key: 'medium', px: 12, label: 'Średnia' },
  { key: 'thick',  px: 22, label: 'Gruba' },
]

const TOOLS = [
  { key: 'arrow',    label: 'Strzałka',  icon: '➤' },
  { key: 'circle',   label: 'Kółko',     icon: '○' },
  { key: 'rect',     label: 'Prostokąt', icon: '▭' },
  { key: 'freehand', label: 'Rysuj',     icon: '✎' },
  { key: 'text',     label: 'Tekst',     icon: 'A' },
  { key: 'pan',      label: 'Przesuń',   icon: '🖐' },
]

const newShapeId = () => Math.random().toString(36).slice(2, 11)
const SELECTION_BLUE = '#3D70B2'
const MAX_ZOOM_MULT = 8      // max zoom = 8× fit
const HISTORY_LIMIT = 60
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// ---------- Undo/redo history reducer ----------
// State: { shapes, past[], future[] }. Snapshots are plain shape arrays — a
// report rarely has more than a handful, so full-array snapshots are cheap and
// far more robust than diffing. Structural edits (crop/rotate) use RESET, which
// clears history so undo never crosses a base-image transform (would misalign).
const initHist = { shapes: [], past: [], future: [] }
function histReducer(state, a) {
  switch (a.type) {
    case 'LIVE': // in-progress drag/draw — update shapes WITHOUT touching history
      return { ...state, shapes: a.shapes }
    case 'COMMIT': // record current shapes into past, apply new array
      return { shapes: a.shapes, past: [...state.past, state.shapes].slice(-HISTORY_LIMIT), future: [] }
    case 'COMMIT_FROM': // shapes already mutated live; record the pre-op array
      return { shapes: state.shapes, past: [...state.past, a.origin].slice(-HISTORY_LIMIT), future: [] }
    case 'UNDO':
      if (!state.past.length) return state
      return {
        shapes: state.past[state.past.length - 1],
        past: state.past.slice(0, -1),
        future: [state.shapes, ...state.future],
      }
    case 'REDO':
      if (!state.future.length) return state
      return {
        shapes: state.future[0],
        past: [...state.past, state.shapes],
        future: state.future.slice(1),
      }
    case 'RESET':
      return { shapes: a.shapes, past: [], future: [] }
    default:
      return state
  }
}

// `source` — dataURL or object URL for the full-resolution image.
// `mimeType` — original mime (e.g. "image/png"); PNG is re-saved losslessly,
//   everything else as high-quality JPEG (0.92). Avoids generational JPEG loss.
// `initialShapes` — vector annotations to restore (non-destructive re-editing);
//   they live in the same image-coordinate space as `source`.
// `onSave` receives { blob, shapes, baseBlob }:
//   • blob      — flattened image (base + shapes baked in) for ZIP/PDF export
//   • shapes    — the editable vector overlay to persist for the next edit
//   • baseBlob  — the clean base ONLY if crop/rotate changed it (else undefined)
//
// EDITING MODEL:
//   • Coordinates are stored in IMAGE space; a view transform (scale/tx/ty)
//     maps image → screen so the user can pinch/scroll to zoom & pan and place
//     annotations precisely on high-res phone photos.
//   • Tap a shape to select → drag to move, drag a handle to resize, restyle
//     via color/width, "Usuń" to delete. Every action is undoable (↶/↷).
//   • ✂ Kadruj / ⟳ Obróć transform the base image itself (and existing shapes).
export default function PhotoAnnotator({ source, onSave, onCancel, mimeType = '', initialShapes = [] }) {
  const toast = useToast()
  const confirm = useConfirm()

  const wrapRef = useRef(null)      // positioned container (canvas + overlays)
  const canvasRef = useRef(null)
  const baseRef = useRef(null)      // current base: ImageBitmap or offscreen canvas
  const measureRef = useRef(null)   // 1×1 ctx for text metrics (transform-free)
  const baseDirtyRef = useRef(false) // true once crop/rotate changed the base image

  // Layout refs (not state — updated by ResizeObserver, read during draw).
  const cssRef = useRef({ w: 0, h: 0 })
  const dprRef = useRef(1)

  const [baseSize, setBaseSize] = useState({ w: 0, h: 0 })
  const [ready, setReady] = useState(false)
  const [resizeTick, setResizeTick] = useState(0)

  const [tool, setTool] = useState('arrow')
  const [color, setColor] = useState(COLORS[0].value)
  const [width, setWidth] = useState(WIDTHS[1].px)

  // Lazy init restores any previously-saved shapes (shallow-copied so the
  // reducer never mutates the caller's array). Runs once per mount; the editor
  // remounts on each open, so re-editing always seeds from the persisted shapes.
  const [hist, dispatch] = useReducer(histReducer, initialShapes, (init) => ({
    shapes: (init || []).map((s) => ({ ...s })),
    past: [],
    future: [],
  }))
  const shapes = hist.shapes

  const [drawing, setDrawing] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 })
  const [mode, setMode] = useState('draw') // 'draw' | 'crop'
  const [cropRect, setCropRect] = useState(null) // image coords {x,y,w,h}
  const [textEditor, setTextEditor] = useState(null) // {id|null, ix, iy, value}

  const selectedShape = selectedId ? shapes.find((s) => s.id === selectedId) : null

  // Transient interaction refs (avoid re-render churn during a gesture/drag).
  const pointersRef = useRef(new Map())   // pointerId → {x,y} (CSS px in canvas)
  const gestureRef = useRef(null)         // active 2-finger pinch/pan
  const dragRef = useRef(null)            // active 1-finger draw/move/resize
  const suppressDrawRef = useRef(false)   // after a gesture, ignore stray draws

  // ---------- Fit / coordinate helpers ----------

  const fitScale = useCallback(() => {
    const { w: cw, h: ch } = cssRef.current
    const { w, h } = baseSize
    if (!w || !h || !cw || !ch) return 1
    return Math.min(cw / w, ch / h)
  }, [baseSize])

  // Fit for explicit dimensions — used after crop/rotate, where `baseSize` state
  // hasn't re-rendered yet so the memoized computeFit() would use stale dims.
  const computeFitFor = useCallback((w, h) => {
    const { w: cw, h: ch } = cssRef.current
    if (!w || !h || !cw || !ch) return { scale: 1, tx: 0, ty: 0 }
    const s = Math.min(cw / w, ch / h)
    return { scale: s, tx: (cw - w * s) / 2, ty: (ch - h * s) / 2 }
  }, [])

  const computeFit = useCallback(() => computeFitFor(baseSize.w, baseSize.h), [baseSize, computeFitFor])

  // Keep the image covering the viewport (or centered when smaller than it).
  const clampView = useCallback((v) => {
    const { w: cw, h: ch } = cssRef.current
    const iw = baseSize.w * v.scale
    const ih = baseSize.h * v.scale
    let { tx, ty } = v
    tx = iw <= cw ? (cw - iw) / 2 : clamp(tx, cw - iw, 0)
    ty = ih <= ch ? (ch - ih) / 2 : clamp(ty, ch - ih, 0)
    return { scale: v.scale, tx, ty }
  }, [baseSize])

  // CSS-in-canvas point → image coords, using a specific view.
  const toImage = (cx, cy, v = view) => ({ x: (cx - v.tx) / v.scale, y: (cy - v.ty) / v.scale })
  const toScreen = (ix, iy, v = view) => ({ x: ix * v.scale + v.tx, y: iy * v.scale + v.ty })
  // Keep drawn/placed annotations inside the image — tapping the dark letterbox
  // around the photo would otherwise create shapes with off-image coords that
  // silently vanish from the exported (image-only) result.
  const clampToImage = (p) => ({ x: clamp(p.x, 0, baseSize.w), y: clamp(p.y, 0, baseSize.h) })

  const canvasPoint = (e) => {
    const r = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  // ---------- Base image load ----------
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      baseRef.current = img
      setBaseSize({ w: img.naturalWidth || 400, h: img.naturalHeight || 300 })
      setReady(true)
    }
    img.src = source
  }, [source])

  // ---------- Canvas sizing (DPR-aware) via ResizeObserver ----------
  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const sync = () => {
      const rect = wrap.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      dprRef.current = dpr
      cssRef.current = { w: rect.width, h: rect.height }
      canvas.width = Math.max(1, Math.round(rect.width * dpr))
      canvas.height = Math.max(1, Math.round(rect.height * dpr))
      setResizeTick((t) => t + 1)
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  // First good layout after the image is ready → fit to screen.
  const didFitRef = useRef(false)
  useEffect(() => {
    if (!ready || !cssRef.current.w) return
    if (didFitRef.current) return
    didFitRef.current = true
    setView(computeFit())
  }, [ready, resizeTick, computeFit])

  // On viewport resize (e.g. phone rotate): re-fit if we were fitted, else clamp.
  const prevFitRef = useRef(null)
  useEffect(() => {
    if (!ready) return
    const f = computeFit()
    const wasFitted = prevFitRef.current == null ||
      Math.abs(view.scale - prevFitRef.current) < 0.005
    prevFitRef.current = f.scale
    setView((v) => (wasFitted ? f : clampView(v)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizeTick])

  // ---------- Text metrics (image space) ----------
  function measureCtx() {
    if (!measureRef.current) {
      const c = document.createElement('canvas')
      measureRef.current = c.getContext('2d')
    }
    return measureRef.current
  }
  function textFontPx(s) {
    return Math.max(16 / (fitScale() || 1), (s.w || 12) * 3)
  }
  function textFontStr(px) {
    return `bold ${px}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif`
  }
  function measureTextShape(s) {
    const fp = textFontPx(s)
    const ctx = measureCtx()
    ctx.font = textFontStr(fp)
    const lines = String(s.text || '').split('\n')
    let w = 0
    for (const ln of lines) w = Math.max(w, ctx.measureText(ln).width)
    return { w, h: fp * 1.25 * lines.length, lineH: fp * 1.25, fontPx: fp }
  }

  // ---------- Shape drawing (pure image space) ----------
  function drawShape(ctx, s) {
    ctx.save()
    ctx.strokeStyle = s.color
    ctx.fillStyle = s.color
    ctx.lineWidth = s.w
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (s.type === 'arrow') {
      drawArrow(ctx, s.x1, s.y1, s.x2, s.y2, s.w)
    } else if (s.type === 'rect') {
      ctx.strokeRect(Math.min(s.x1, s.x2), Math.min(s.y1, s.y2), Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1))
    } else if (s.type === 'circle') {
      const cx = (s.x1 + s.x2) / 2, cy = (s.y1 + s.y2) / 2
      const rx = Math.abs(s.x2 - s.x1) / 2, ry = Math.abs(s.y2 - s.y1) / 2
      ctx.beginPath()
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
      ctx.stroke()
    } else if (s.type === 'freehand') {
      const pts = s.points || []
      if (pts.length < 2) { ctx.restore(); return }
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
      ctx.stroke()
    } else if (s.type === 'text') {
      const { fontPx, lineH } = measureTextShape(s)
      ctx.font = textFontStr(fontPx)
      ctx.textBaseline = 'top'
      ctx.lineWidth = Math.max(fontPx * 0.14, 2)
      ctx.strokeStyle = s.color === '#FFFFFF' ? '#111827' : '#FFFFFF'
      const lines = String(s.text || '').split('\n')
      lines.forEach((ln, i) => {
        ctx.strokeText(ln, s.x1, s.y1 + i * lineH)
        ctx.fillStyle = s.color
        ctx.fillText(ln, s.x1, s.y1 + i * lineH)
      })
    }
    ctx.restore()
  }

  function drawArrow(ctx, x1, y1, x2, y2, w) {
    const dx = x2 - x1, dy = y2 - y1
    const len = Math.hypot(dx, dy)
    if (len < 1) return
    const headLen = w * 3.5
    const ux = dx / len, uy = dy / len
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2 - ux * headLen, y2 - uy * headLen)
    ctx.stroke()
    const ang = Math.atan2(dy, dx)
    const wing = headLen * 0.6
    ctx.beginPath()
    ctx.moveTo(x2, y2)
    ctx.lineTo(x2 - headLen * Math.cos(ang - Math.PI / 7), y2 - headLen * Math.sin(ang - Math.PI / 7))
    ctx.lineTo(x2 - wing * Math.cos(ang), y2 - wing * Math.sin(ang))
    ctx.lineTo(x2 - headLen * Math.cos(ang + Math.PI / 7), y2 - headLen * Math.sin(ang + Math.PI / 7))
    ctx.closePath()
    ctx.fill()
  }

  // ---------- Bounding boxes / handles ----------
  function getBbox(s) {
    if (s.type === 'arrow' || s.type === 'rect' || s.type === 'circle') {
      return { minX: Math.min(s.x1, s.x2), maxX: Math.max(s.x1, s.x2), minY: Math.min(s.y1, s.y2), maxY: Math.max(s.y1, s.y2) }
    }
    if (s.type === 'freehand') {
      const pts = s.points || []
      if (!pts.length) return null
      let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y
      for (const p of pts) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y
      }
      return { minX, minY, maxX, maxY }
    }
    if (s.type === 'text') {
      const { w, h } = measureTextShape(s)
      return { minX: s.x1, minY: s.y1, maxX: s.x1 + w, maxY: s.y1 + h }
    }
    return null
  }

  function getHandles(s) {
    if (s.type === 'arrow') return [{ x: s.x1, y: s.y1, role: 'p1' }, { x: s.x2, y: s.y2, role: 'p2' }]
    if (s.type === 'rect' || s.type === 'circle') {
      return [
        { x: s.x1, y: s.y1, role: 'tl' }, { x: s.x2, y: s.y1, role: 'tr' },
        { x: s.x2, y: s.y2, role: 'br' }, { x: s.x1, y: s.y2, role: 'bl' },
      ]
    }
    if (s.type === 'text') {
      const { w, h } = measureTextShape(s)
      return [{ x: s.x1 + w, y: s.y1 + h, role: 'fontsize' }]
    }
    return [] // freehand: no resize handles
  }

  // ---------- Hit testing (tolerance in image px = screen px ÷ scale) ----------
  function distToSegment(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
    t = clamp(t, 0, 1)
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
  }
  function hitShape(s, p, tol) {
    if (s.type === 'arrow') {
      if (distToSegment(p, { x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }) <= tol) return true
      return Math.hypot(p.x - s.x2, p.y - s.y2) <= s.w * 3.5
    }
    if (s.type === 'rect') {
      return p.x >= Math.min(s.x1, s.x2) - tol && p.x <= Math.max(s.x1, s.x2) + tol &&
             p.y >= Math.min(s.y1, s.y2) - tol && p.y <= Math.max(s.y1, s.y2) + tol
    }
    if (s.type === 'circle') {
      const cx = (s.x1 + s.x2) / 2, cy = (s.y1 + s.y2) / 2
      const rx = Math.abs(s.x2 - s.x1) / 2 + tol, ry = Math.abs(s.y2 - s.y1) / 2 + tol
      if (rx <= 0 || ry <= 0) return false
      const nx = (p.x - cx) / rx, ny = (p.y - cy) / ry
      return nx * nx + ny * ny <= 1
    }
    if (s.type === 'freehand') {
      const pts = s.points || []
      for (let i = 1; i < pts.length; i++) if (distToSegment(p, pts[i - 1], pts[i]) <= tol) return true
      return false
    }
    if (s.type === 'text') {
      const { w, h } = measureTextShape(s)
      return p.x >= s.x1 - tol && p.x <= s.x1 + w + tol && p.y >= s.y1 - tol && p.y <= s.y1 + h + tol
    }
    return false
  }
  function hitHandle(s, p, tol) {
    for (const h of getHandles(s)) if (Math.hypot(p.x - h.x, p.y - h.y) <= tol) return h
    return null
  }

  // ---------- Mutations ----------
  function moveShape(s, dx, dy) {
    if (s.type === 'freehand') return { ...s, points: s.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })) }
    if (s.type === 'text') return { ...s, x1: s.x1 + dx, y1: s.y1 + dy }
    return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy }
  }
  function resizeShape(s, role, p) {
    if (s.type === 'arrow') {
      if (role === 'p1') return { ...s, x1: p.x, y1: p.y }
      if (role === 'p2') return { ...s, x2: p.x, y2: p.y }
    }
    if (s.type === 'rect' || s.type === 'circle') {
      if (role === 'tl') return { ...s, x1: p.x, y1: p.y }
      if (role === 'tr') return { ...s, x2: p.x, y1: p.y }
      if (role === 'br') return { ...s, x2: p.x, y2: p.y }
      if (role === 'bl') return { ...s, x1: p.x, y2: p.y }
    }
    if (s.type === 'text' && role === 'fontsize') {
      // Handle sits at (x1+w, y1+h); drag distance ≈ new text height → new w.
      const newH = Math.max(20, p.y - s.y1)
      const fp = newH / 1.25
      return { ...s, w: clamp(fp / 3, 4, 4000) }
    }
    return s
  }

  // ---------- Rendering ----------
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const base = baseRef.current
    if (!canvas || !base) return
    const ctx = canvas.getContext('2d')
    const dpr = dprRef.current
    const { w: cw, h: ch } = cssRef.current

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    // Dark backdrop around the image
    ctx.fillStyle = '#1f2937'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Image-space transform (folds in DPR + view)
    ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.tx, dpr * view.ty)
    ctx.drawImage(base, 0, 0, baseSize.w, baseSize.h)

    const list = drawing ? [...shapes, drawing] : shapes
    for (const s of list) drawShape(ctx, s)

    if (mode === 'draw' && selectedId) {
      const sel = list.find((s) => s.id === selectedId)
      if (sel) drawSelectionOverlay(ctx, sel)
    }

    // Crop overlay — drawn in CSS space (DPR only), on top of everything.
    if (mode === 'crop' && cropRect) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const tl = toScreen(cropRect.x, cropRect.y)
      const br = toScreen(cropRect.x + cropRect.w, cropRect.y + cropRect.h)
      const rx = tl.x, ry = tl.y, rw = br.x - tl.x, rh = br.y - tl.y
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fillRect(0, 0, cw, ry)                       // top
      ctx.fillRect(0, ry + rh, cw, ch - (ry + rh))     // bottom
      ctx.fillRect(0, ry, rx, rh)                      // left
      ctx.fillRect(rx + rw, ry, cw - (rx + rw), rh)    // right
      ctx.strokeStyle = '#FFFFFF'
      ctx.lineWidth = 2
      ctx.strokeRect(rx, ry, rw, rh)
      // corner handles
      ctx.fillStyle = '#FFFFFF'
      for (const [hx, hy] of [[rx, ry], [rx + rw, ry], [rx + rw, ry + rh], [rx, ry + rh]]) {
        ctx.beginPath(); ctx.arc(hx, hy, 8, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = SELECTION_BLUE; ctx.lineWidth = 2; ctx.stroke()
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapes, drawing, selectedId, view, mode, cropRect, baseSize])

  function drawSelectionOverlay(ctx, s) {
    const bbox = getBbox(s)
    if (!bbox) return
    const ui = 1 / view.scale // screen-constant sizes in image space
    ctx.save()
    ctx.strokeStyle = SELECTION_BLUE
    ctx.lineWidth = 2 * ui
    ctx.setLineDash([8 * ui, 4 * ui])
    const pad = 6 * ui
    ctx.strokeRect(bbox.minX - pad, bbox.minY - pad, bbox.maxX - bbox.minX + 2 * pad, bbox.maxY - bbox.minY + 2 * pad)
    ctx.setLineDash([])
    for (const h of getHandles(s)) {
      ctx.beginPath()
      ctx.arc(h.x, h.y, 9 * ui, 0, Math.PI * 2)
      ctx.fillStyle = '#FFFFFF'; ctx.fill()
      ctx.strokeStyle = SELECTION_BLUE; ctx.lineWidth = 2 * ui; ctx.stroke()
    }
    ctx.restore()
  }

  // Layout effect (not passive) so a canvas resize repaints BEFORE the browser
  // paints — otherwise resizing the backing store clears it and a blank frame
  // flashes (e.g. when the selection row grows the toolbar).
  useLayoutEffect(() => { draw() }, [draw, resizeTick])

  // ---------- Zoom helpers ----------
  const zoomAround = useCallback((cx, cy, factor) => {
    setView((v) => {
      const minS = fitScale()
      const maxS = minS * MAX_ZOOM_MULT
      const ns = clamp(v.scale * factor, minS, maxS)
      const ip = toImage(cx, cy, v)
      return clampView({ scale: ns, tx: cx - ns * ip.x, ty: cy - ns * ip.y })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitScale, clampView])

  const zoomButton = (factor) => {
    const { w, h } = cssRef.current
    zoomAround(w / 2, h / 2, factor)
  }
  const fitView = () => setView(computeFit())

  const onWheel = (e) => {
    if (mode === 'crop') return
    e.preventDefault()
    const p = canvasPoint(e)
    zoomAround(p.x, p.y, e.deltaY < 0 ? 1.15 : 1 / 1.15)
  }

  // ---------- Pointer handling ----------
  const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
  const midOf = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

  const beginGesture = () => {
    const pts = [...pointersRef.current.values()]
    if (pts.length < 2) return
    const [a, b] = pts
    gestureRef.current = {
      startDist: dist2(a, b),
      startMid: midOf(a, b),
      startView: view,
      startMidImg: toImage(midOf(a, b).x, midOf(a, b).y, view),
    }
    // Cancel any in-progress single-finger action
    dragRef.current = null
    if (drawing) setDrawing(null)
  }

  const onPointerDown = (e) => {
    e.preventDefault()
    const p = canvasPoint(e)
    pointersRef.current.set(e.pointerId, p)
    try { canvasRef.current.setPointerCapture(e.pointerId) } catch {}

    if (pointersRef.current.size >= 2) { beginGesture(); return }
    if (mode === 'crop') { cropPointerDown(p); return }

    const scale = view.scale
    const ip = toImage(p.x, p.y)
    const tol = 14 / scale

    if (tool === 'pan') { dragRef.current = { kind: 'pan', startP: p, startView: view }; return }

    // Handles of the selected shape take priority
    if (selectedShape) {
      const h = hitHandle(selectedShape, ip, 24 / scale)
      if (h) { dragRef.current = { kind: 'handle', role: h.role, origin: shapes, id: selectedShape.id, moved: false }; return }
    }
    // Hit-test all shapes, topmost first
    for (let i = shapes.length - 1; i >= 0; i--) {
      if (hitShape(shapes[i], ip, tol)) {
        setSelectedId(shapes[i].id)
        dragRef.current = { kind: 'move', startP: ip, origin: shapes, orig: shapes[i], id: shapes[i].id, moved: false }
        return
      }
    }
    // Empty area — start a new shape (clamped to the image, never the letterbox)
    if (selectedId) setSelectedId(null)
    const w = width / (fitScale() || 1) // preset screen-px → absolute image-px
    const cp = clampToImage(ip)

    if (tool === 'text') { openTextEditor(null, cp); return }
    if (tool === 'freehand') { setDrawing({ id: newShapeId(), type: 'freehand', points: [cp], color, w }) }
    else { setDrawing({ id: newShapeId(), type: tool, x1: cp.x, y1: cp.y, x2: cp.x, y2: cp.y, color, w }) }
  }

  const onPointerMove = (e) => {
    if (!pointersRef.current.has(e.pointerId)) return
    const p = canvasPoint(e)
    pointersRef.current.set(e.pointerId, p)

    // 2-finger pinch/pan
    if (gestureRef.current && pointersRef.current.size >= 2) {
      e.preventDefault()
      const pts = [...pointersRef.current.values()]
      const [a, b] = pts
      const g = gestureRef.current
      const factor = dist2(a, b) / (g.startDist || 1)
      const minS = fitScale(), maxS = minS * MAX_ZOOM_MULT
      const ns = clamp(g.startView.scale * factor, minS, maxS)
      const mid = midOf(a, b)
      setView(clampView({ scale: ns, tx: mid.x - ns * g.startMidImg.x, ty: mid.y - ns * g.startMidImg.y }))
      return
    }

    const d = dragRef.current
    if (mode === 'crop') { if (d) { e.preventDefault(); cropPointerMove(p) } return }
    if (!d && !drawing) return
    e.preventDefault()
    const ip = toImage(p.x, p.y)

    if (d) {
      if (d.kind === 'pan') {
        const dx = p.x - d.startP.x, dy = p.y - d.startP.y
        setView(clampView({ scale: d.startView.scale, tx: d.startView.tx + dx, ty: d.startView.ty + dy }))
      } else if (d.kind === 'move') {
        d.moved = true
        const dx = ip.x - d.startP.x, dy = ip.y - d.startP.y
        dispatch({ type: 'LIVE', shapes: shapes.map((s) => (s.id === d.id ? moveShape(d.orig, dx, dy) : s)) })
      } else if (d.kind === 'handle') {
        d.moved = true
        dispatch({ type: 'LIVE', shapes: shapes.map((s) => (s.id === d.id ? resizeShape(s, d.role, ip) : s)) })
      }
      return
    }

    const cp = clampToImage(ip)
    setDrawing((dr) => {
      if (!dr) return dr
      if (dr.type === 'freehand') return { ...dr, points: [...dr.points, cp] }
      return { ...dr, x2: cp.x, y2: cp.y }
    })
  }

  const endPointer = (e) => {
    pointersRef.current.delete(e.pointerId)
    try { canvasRef.current.releasePointerCapture(e.pointerId) } catch {}

    if (gestureRef.current) {
      if (pointersRef.current.size < 2) { gestureRef.current = null; suppressDrawRef.current = pointersRef.current.size > 0 }
      if (pointersRef.current.size === 0) suppressDrawRef.current = false
      return
    }

    const d = dragRef.current
    if (d) {
      dragRef.current = null
      if ((d.kind === 'move' || d.kind === 'handle') && d.moved) {
        dispatch({ type: 'COMMIT_FROM', origin: d.origin })
      }
      return
    }

    if (mode === 'crop') return

    if (!drawing) return
    // Discard tiny accidental strokes
    if (drawing.type !== 'freehand') {
      if (Math.hypot(drawing.x2 - drawing.x1, drawing.y2 - drawing.y1) < 4 / view.scale) { setDrawing(null); return }
    } else if ((drawing.points || []).length < 2) { setDrawing(null); return }
    dispatch({ type: 'COMMIT', shapes: [...shapes, drawing] })
    setSelectedId(drawing.id)
    setDrawing(null)
  }

  // ---------- Crop rect manipulation ----------
  const cropDragRef = useRef(null)
  function cropHandleAt(ip, tol) {
    if (!cropRect) return null
    const c = cropRect
    const corners = [
      { x: c.x, y: c.y, role: 'tl' }, { x: c.x + c.w, y: c.y, role: 'tr' },
      { x: c.x + c.w, y: c.y + c.h, role: 'br' }, { x: c.x, y: c.y + c.h, role: 'bl' },
    ]
    for (const h of corners) if (Math.hypot(ip.x - h.x, ip.y - h.y) <= tol) return h.role
    return null
  }
  function cropPointerDown(p) {
    const ip = toImage(p.x, p.y)
    const role = cropHandleAt(ip, 24 / view.scale)
    if (role) { cropDragRef.current = { kind: role, start: ip, rect: cropRect }; dragRef.current = { kind: 'crop' }; return }
    const c = cropRect
    if (c && ip.x >= c.x && ip.x <= c.x + c.w && ip.y >= c.y && ip.y <= c.y + c.h) {
      cropDragRef.current = { kind: 'move', start: ip, rect: c }; dragRef.current = { kind: 'crop' }
    }
  }
  function cropPointerMove(p) {
    const cd = cropDragRef.current
    if (!cd) return
    const ip = toImage(p.x, p.y)
    const dx = ip.x - cd.start.x, dy = ip.y - cd.start.y
    const r = cd.rect
    const B = baseSize
    let nx = r.x, ny = r.y, nw = r.w, nh = r.h
    const MIN = Math.max(16, Math.min(B.w, B.h) * 0.05)
    if (cd.kind === 'move') {
      nx = clamp(r.x + dx, 0, B.w - r.w); ny = clamp(r.y + dy, 0, B.h - r.h)
    } else {
      let x1 = r.x, y1 = r.y, x2 = r.x + r.w, y2 = r.y + r.h
      if (cd.kind.includes('l')) x1 = clamp(r.x + dx, 0, x2 - MIN)
      if (cd.kind.includes('r')) x2 = clamp(r.x + r.w + dx, x1 + MIN, B.w)
      if (cd.kind.includes('t')) y1 = clamp(r.y + dy, 0, y2 - MIN)
      if (cd.kind.includes('b')) y2 = clamp(r.y + r.h + dy, y1 + MIN, B.h)
      nx = x1; ny = y1; nw = x2 - x1; nh = y2 - y1
    }
    setCropRect({ x: nx, y: ny, w: nw, h: nh })
  }

  const enterCrop = () => {
    setSelectedId(null)
    const B = baseSize
    const inset = 0.06
    setCropRect({ x: B.w * inset, y: B.h * inset, w: B.w * (1 - 2 * inset), h: B.h * (1 - 2 * inset) })
    setMode('crop')
    setView(computeFit())
  }
  const cancelCrop = () => { setMode('draw'); setCropRect(null); cropDragRef.current = null }
  const applyCrop = () => {
    const c = cropRect
    if (!c) { cancelCrop(); return }
    const cx = Math.round(c.x), cy = Math.round(c.y)
    const cw = Math.max(1, Math.round(c.w)), ch = Math.max(1, Math.round(c.h))
    const off = document.createElement('canvas')
    off.width = cw; off.height = ch
    off.getContext('2d').drawImage(baseRef.current, cx, cy, cw, ch, 0, 0, cw, ch)
    baseRef.current = off
    baseDirtyRef.current = true
    // Translate shapes into the new origin; drop those fully outside the crop.
    const shift = (s) => {
      if (s.type === 'freehand') return { ...s, points: s.points.map((p) => ({ x: p.x - cx, y: p.y - cy })) }
      if (s.type === 'text') return { ...s, x1: s.x1 - cx, y1: s.y1 - cy }
      return { ...s, x1: s.x1 - cx, y1: s.y1 - cy, x2: s.x2 - cx, y2: s.y2 - cy }
    }
    const inside = (s) => {
      const b = getBbox(s)
      return b && b.maxX > 0 && b.minX < cw && b.maxY > 0 && b.minY < ch
    }
    const next = shapes.filter(inside).map(shift)
    dispatch({ type: 'RESET', shapes: next })
    setBaseSize({ w: cw, h: ch })
    setMode('draw'); setCropRect(null); cropDragRef.current = null
    prevFitRef.current = null
    setView(computeFitFor(cw, ch))
  }

  // ---------- Rotate 90° CW ----------
  const rotateCW = () => {
    const B = baseSize
    const nw = B.h, nh = B.w
    const off = document.createElement('canvas')
    off.width = nw; off.height = nh
    const octx = off.getContext('2d')
    octx.translate(nw, 0)
    octx.rotate(Math.PI / 2)
    octx.drawImage(baseRef.current, 0, 0, B.w, B.h)
    baseRef.current = off
    baseDirtyRef.current = true
    // Point (x,y) → (oldH - y, x)
    const rp = (x, y) => ({ x: B.h - y, y: x })
    const rot = (s) => {
      if (s.type === 'freehand') return { ...s, points: s.points.map((p) => rp(p.x, p.y)) }
      if (s.type === 'text') { const q = rp(s.x1, s.y1); return { ...s, x1: q.x, y1: q.y } }
      const a = rp(s.x1, s.y1), b = rp(s.x2, s.y2)
      return { ...s, x1: a.x, y1: a.y, x2: b.x, y2: b.y }
    }
    dispatch({ type: 'RESET', shapes: shapes.map(rot) })
    setSelectedId(null)
    setBaseSize({ w: nw, h: nh })
    prevFitRef.current = null
    setView(computeFitFor(nw, nh))
  }

  // ---------- Text editor overlay ----------
  function openTextEditor(id, ip) {
    if (id) {
      const s = shapes.find((x) => x.id === id)
      setTextEditor({ id, ix: s.x1, iy: s.y1, value: s.text || '' })
    } else {
      setTextEditor({ id: null, ix: ip.x, iy: ip.y, value: '' })
    }
  }
  const commitText = () => {
    const te = textEditor
    if (!te) return
    const val = (te.value || '').replace(/\s+$/,'')
    if (te.id) {
      if (!val.trim()) { // emptied → delete
        dispatch({ type: 'COMMIT', shapes: shapes.filter((s) => s.id !== te.id) })
        setSelectedId(null)
      } else {
        dispatch({ type: 'COMMIT', shapes: shapes.map((s) => (s.id === te.id ? { ...s, text: val } : s)) })
      }
    } else if (val.trim()) {
      const w = width / (fitScale() || 1)
      const shape = { id: newShapeId(), type: 'text', x1: te.ix, y1: te.iy, text: val, color, w }
      dispatch({ type: 'COMMIT', shapes: [...shapes, shape] })
      setSelectedId(shape.id)
    }
    setTextEditor(null)
  }
  const cancelText = () => setTextEditor(null)

  // ---------- Toolbar actions ----------
  const canUndo = hist.past.length > 0
  const canRedo = hist.future.length > 0
  const undo = () => { dispatch({ type: 'UNDO' }); setSelectedId(null) }
  const redo = () => { dispatch({ type: 'REDO' }); setSelectedId(null) }
  const clearAll = async () => {
    if (!shapes.length) return
    if (await confirm('Usunąć wszystkie adnotacje?', { title: 'Wyczyść', confirmLabel: 'Usuń', variant: 'danger' })) {
      dispatch({ type: 'COMMIT', shapes: [] })
      setSelectedId(null)
    }
  }
  const deleteSelected = () => {
    if (!selectedId) return
    dispatch({ type: 'COMMIT', shapes: shapes.filter((s) => s.id !== selectedId) })
    setSelectedId(null)
  }
  const restyle = (patch) => {
    if (!selectedId) return
    dispatch({ type: 'COMMIT', shapes: shapes.map((s) => (s.id === selectedId ? { ...s, ...patch } : s)) })
  }
  const handleColor = (c) => { setColor(c); if (selectedId) restyle({ color: c }) }
  const handleWidth = (px) => {
    setWidth(px)
    if (selectedId) restyle({ w: px / (fitScale() || 1) })
  }

  // ---------- Save ----------
  // Non-destructive: returns the flattened image for export AND the editable
  // shapes (+ a fresh clean base only if crop/rotate changed it) so the caller
  // can persist everything and re-open the editor with annotations intact.
  const save = () => {
    const B = baseSize
    const isPng = /png/i.test(mimeType)
    const type = isPng ? 'image/png' : 'image/jpeg'
    // Serializable snapshot of the overlay (detached from reducer state).
    const shapesCopy = shapes.map((s) => ({
      ...s,
      ...(s.points ? { points: s.points.map((p) => ({ x: p.x, y: p.y })) } : {}),
    }))

    // Clean base blob — only when crop/rotate mutated it (else caller keeps the
    // existing base / snapshots the pristine original, avoiding a re-encode).
    const makeBase = (cb) => {
      if (!baseDirtyRef.current) { cb(undefined); return }
      const bc = document.createElement('canvas')
      bc.width = B.w; bc.height = B.h
      bc.getContext('2d').drawImage(baseRef.current, 0, 0, B.w, B.h)
      if (bc.toBlob) bc.toBlob((b) => cb(b || undefined), type, isPng ? undefined : 0.95)
      else cb(undefined)
    }

    // Flattened export image (base + shapes baked in).
    const out = document.createElement('canvas')
    out.width = B.w; out.height = B.h
    const octx = out.getContext('2d')
    octx.drawImage(baseRef.current, 0, 0, B.w, B.h)
    for (const s of shapes) drawShape(octx, s)

    const emit = (flatBlob) => {
      if (!flatBlob) return
      makeBase((baseBlob) => onSave({ blob: flatBlob, shapes: shapesCopy, baseBlob }))
    }
    if (out.toBlob) out.toBlob(emit, type, isPng ? undefined : 0.92)
    else fetch(out.toDataURL(type, 0.92)).then((r) => r.blob()).then(emit)
  }

  const zoomPct = baseSize.w ? Math.round((view.scale / (fitScale() || 1)) * 100) : 100
  const textScreen = textEditor ? toScreen(textEditor.ix, textEditor.iy) : null

  return (
    <div className="fixed inset-0 bg-black z-[60] flex flex-col select-none">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-900 text-white">
        <button onClick={onCancel} className="text-sm px-3 py-1.5 rounded bg-white/10 hover:bg-white/20">Anuluj</button>
        <div className="text-sm font-medium">
          {mode === 'crop' ? 'Kadrowanie' : selectedShape ? 'Edycja zaznaczonego' : 'Adnotacje'}
        </div>
        <button onClick={save} className="text-sm px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 font-medium">Zapisz</button>
      </div>

      {/* Canvas area */}
      <div ref={wrapRef} className="relative flex-1 overflow-hidden bg-gray-800" style={{ touchAction: 'none' }}>
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onWheel={onWheel}
          className="absolute inset-0 w-full h-full"
          style={{ touchAction: 'none', cursor: tool === 'pan' ? 'grab' : selectedShape ? 'move' : 'crosshair' }}
        />

        {/* Floating zoom controls (hidden in crop mode) */}
        {mode === 'draw' && (
          <div className="absolute top-2 right-2 flex flex-col gap-1 bg-gray-900/80 backdrop-blur rounded-lg p-1 text-white">
            <button onClick={() => zoomButton(1.3)} className="w-9 h-9 rounded hover:bg-white/15 text-lg leading-none" aria-label="Powiększ">＋</button>
            <div className="text-[10px] text-center tabular-nums text-white/70">{zoomPct}%</div>
            <button onClick={() => zoomButton(1 / 1.3)} className="w-9 h-9 rounded hover:bg-white/15 text-lg leading-none" aria-label="Pomniejsz">－</button>
            <button onClick={fitView} className="w-9 h-9 rounded hover:bg-white/15 text-sm leading-none" title="Dopasuj" aria-label="Dopasuj do ekranu">⤢</button>
          </div>
        )}

        {/* In-place text editor overlay */}
        {textEditor && textScreen && (
          <div
            className="absolute z-10"
            style={{
              left: clamp(textScreen.x, 8, (cssRef.current.w || 300) - 220),
              top: clamp(textScreen.y, 8, (cssRef.current.h || 300) - 120),
            }}
          >
            <textarea
              autoFocus
              value={textEditor.value}
              onChange={(e) => setTextEditor((t) => ({ ...t, value: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText() }
                if (e.key === 'Escape') { e.preventDefault(); cancelText() }
              }}
              placeholder="Wpisz tekst…"
              rows={2}
              className="w-52 text-sm rounded-lg border-2 border-sure-blue bg-white text-gray-900 px-2 py-1.5 shadow-xl resize-none focus:outline-none"
            />
            <div className="flex gap-1 mt-1">
              <button onMouseDown={(e) => e.preventDefault()} onClick={commitText} className="flex-1 text-xs px-2 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 font-medium">Gotowe</button>
              <button onMouseDown={(e) => e.preventDefault()} onClick={cancelText} className="text-xs px-3 py-1.5 rounded bg-white/90 text-gray-700 hover:bg-white border border-gray-300">Anuluj</button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom toolbar */}
      {mode === 'crop' ? (
        <div className="bg-gray-900 text-white px-3 py-3 flex items-center gap-2">
          <div className="text-xs text-white/70 flex-1">Przeciągnij ramkę i narożniki, aby przyciąć.</div>
          <button onClick={cancelCrop} className="px-3 py-2 rounded text-sm bg-white/10 hover:bg-white/20">Anuluj kadr</button>
          <button onClick={applyCrop} className="px-4 py-2 rounded text-sm bg-sure-blue hover:bg-blue-700 font-medium">Zastosuj kadr</button>
        </div>
      ) : (
        <div className="bg-gray-900 text-white px-2 py-2 space-y-2">
          {/* Tools */}
          <div className="flex gap-1 overflow-x-auto">
            {TOOLS.map((t) => (
              <button
                key={t.key}
                onClick={() => { setTool(t.key); if (t.key !== 'text') setTextEditor(null) }}
                className={'flex-1 min-w-[58px] px-2 py-2 rounded text-xs flex flex-col items-center gap-0.5 transition ' +
                  (tool === t.key ? 'bg-sure-blue text-white' : 'bg-white/10 hover:bg-white/20')}
                aria-pressed={tool === t.key}
              >
                <span className="text-base leading-none">{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          {/* Colors */}
          <div className="flex gap-1 items-center">
            <div className="text-[10px] uppercase tracking-wider text-white/60 mr-1">Kolor</div>
            {COLORS.map((c) => (
              <button
                key={c.key}
                onClick={() => handleColor(c.value)}
                className={'w-8 h-8 rounded-full border-2 transition ' + (color === c.value ? 'border-white scale-110' : 'border-white/30')}
                style={{ background: c.value }}
                aria-label={c.key}
              />
            ))}
          </div>

          {/* Widths + undo/redo */}
          <div className="flex gap-1 items-center">
            <div className="text-[10px] uppercase tracking-wider text-white/60 mr-1">Grubość</div>
            {WIDTHS.map((w) => (
              <button
                key={w.key}
                onClick={() => handleWidth(w.px)}
                className={'flex-1 px-2 py-1.5 rounded text-xs transition ' + (width === w.px ? 'bg-sure-blue text-white' : 'bg-white/10 hover:bg-white/20')}
                aria-pressed={width === w.px}
              >
                {w.label}
              </button>
            ))}
            <button onClick={undo} disabled={!canUndo} className="px-3 py-1.5 rounded text-xs bg-white/10 hover:bg-white/20 disabled:opacity-30" title="Cofnij">↶</button>
            <button onClick={redo} disabled={!canRedo} className="px-3 py-1.5 rounded text-xs bg-white/10 hover:bg-white/20 disabled:opacity-30" title="Ponów">↷</button>
          </div>

          {/* Transforms */}
          <div className="flex gap-1 items-center">
            <button onClick={enterCrop} className="flex-1 px-2 py-1.5 rounded text-xs bg-white/10 hover:bg-white/20">✂ Kadruj</button>
            <button onClick={rotateCW} className="flex-1 px-2 py-1.5 rounded text-xs bg-white/10 hover:bg-white/20">⟳ Obróć</button>
            <button onClick={clearAll} disabled={!shapes.length} className="flex-1 px-2 py-1.5 rounded text-xs bg-red-700/60 hover:bg-red-700 disabled:opacity-30">Wyczyść</button>
          </div>

          {/* Selection row */}
          {selectedShape && (
            <div className="flex gap-1 items-center pt-1 border-t border-white/10">
              <div className="text-[10px] uppercase tracking-wider text-sky-300 mr-1">Zaznaczone</div>
              {selectedShape.type === 'text' && (
                <button onClick={() => openTextEditor(selectedShape.id)} className="px-3 py-1.5 rounded text-xs bg-sky-700 hover:bg-sky-600">✎ Edytuj tekst</button>
              )}
              <button onClick={() => setSelectedId(null)} className="px-3 py-1.5 rounded text-xs bg-white/10 hover:bg-white/20">Odznacz</button>
              <button onClick={deleteSelected} className="ml-auto px-3 py-1.5 rounded text-xs bg-red-600 hover:bg-red-700 font-medium">🗑 Usuń zaznaczony</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
