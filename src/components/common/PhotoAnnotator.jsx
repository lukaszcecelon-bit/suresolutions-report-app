import { useEffect, useRef, useState } from 'react'

const COLORS = [
  { key: 'red',    value: '#EF4444' },
  { key: 'yellow', value: '#F59E0B' },
  { key: 'green',  value: '#10B981' },
  { key: 'blue',   value: '#3D70B2' },
  { key: 'black',  value: '#111827' },
  { key: 'white',  value: '#FFFFFF' },
]

// Width values are in *screen CSS pixels* — the actual canvas lineWidth is
// these × display-scale (see drawShape). Bumped from 3/6/10 because on mobile
// even 6 screen-px arrows were near-invisible against busy photo backgrounds.
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
]

const newShapeId = () => Math.random().toString(36).slice(2, 11)
const SELECTION_BLUE = '#3D70B2'

// `source` can be either a dataURL (string starting with "data:") or an object URL
// for a Blob/File. The annotator draws on a canvas at the image's native resolution
// so the saved Blob preserves the full quality of the original.
//
// EDITING MODEL (v0.4): tap an existing shape to select it — drag to move,
// drag a handle (white dot) to resize, pick a color/width to restyle, hit
// "Usuń zaznaczony" to delete just that shape. Tap empty area = deselect AND
// start drawing a new shape with the active tool (auto-detect).
export default function PhotoAnnotator({ source, onSave, onCancel }) {
  const canvasRef = useRef(null)
  const imgRef = useRef(null)
  const [tool, setTool] = useState('arrow')
  const [color, setColor] = useState(COLORS[0].value)
  const [width, setWidth] = useState(WIDTHS[1].px)
  const [shapes, setShapes] = useState([])
  const [drawing, setDrawing] = useState(null) // shape currently being drawn
  const [selectedId, setSelectedId] = useState(null)
  const [drag, setDrag] = useState(null) // { kind: 'move'|'handle', startP, originalShape, handleRole? }

  const selectedShape = selectedId ? shapes.find((s) => s.id === selectedId) : null

  // Load source image, set canvas size to native res
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = img.naturalWidth || 400
      canvas.height = img.naturalHeight || 300
      redraw([])
    }
    img.src = source
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source])

  // Redraw on every shape / drawing / selection change. selectedId is in deps
  // so the dashed bbox + handles repaint when selection changes (even if
  // shapes themselves didn't move).
  useEffect(() => {
    redraw(drawing ? [...shapes, drawing] : shapes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapes, drawing, selectedId])

  // Re-render on resize so widths stay visually consistent if user rotates phone.
  useEffect(() => {
    const onResize = () => redraw(drawing ? [...shapes, drawing] : shapes)
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapes, drawing, selectedId])

  // ---------- Drawing scaffolding ----------

  // Scale factor: canvas is at image's native res (e.g. 3024px) but displayed
  // at e.g. 360px on phone. Without scaling, a 6px line is invisible on mobile.
  // We treat WIDTHS values as "visible screen pixels" and multiply by this ratio
  // when drawing so a "medium" line always looks the same thickness on any device.
  function getDisplayScale() {
    const canvas = canvasRef.current
    if (!canvas) return 1
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0) return 1
    return canvas.width / rect.width
  }

  function redraw(list) {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const scale = getDisplayScale()
    for (const s of list) drawShape(ctx, s, scale)
    // Selection overlay last so it's on top
    if (selectedId) {
      const sel = list.find((s) => s.id === selectedId)
      if (sel) drawSelectionOverlay(ctx, sel, scale)
    }
  }

  function drawShape(ctx, s, scale = 1) {
    ctx.save()
    const w = s.width * scale
    ctx.strokeStyle = s.color
    ctx.fillStyle = s.color
    ctx.lineWidth = w
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (s.type === 'arrow') {
      drawArrow(ctx, s.x1, s.y1, s.x2, s.y2, w)
    } else if (s.type === 'rect') {
      const x = Math.min(s.x1, s.x2)
      const y = Math.min(s.y1, s.y2)
      const rw = Math.abs(s.x2 - s.x1)
      const rh = Math.abs(s.y2 - s.y1)
      ctx.strokeRect(x, y, rw, rh)
    } else if (s.type === 'circle') {
      const cx = (s.x1 + s.x2) / 2
      const cy = (s.y1 + s.y2) / 2
      const rx = Math.abs(s.x2 - s.x1) / 2
      const ry = Math.abs(s.y2 - s.y1) / 2
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
      const fontPx = textFontPx(s, scale)
      ctx.font = textFont(fontPx)
      ctx.textBaseline = 'top'
      // outline for legibility on any background
      ctx.lineWidth = Math.max(2 * scale, w / 2)
      ctx.strokeStyle = s.color === '#FFFFFF' ? '#111827' : '#FFFFFF'
      ctx.strokeText(s.text || '', s.x1, s.y1)
      ctx.fillStyle = s.color
      ctx.fillText(s.text || '', s.x1, s.y1)
    }
    ctx.restore()
  }

  function drawArrow(ctx, x1, y1, x2, y2, w) {
    const dx = x2 - x1
    const dy = y2 - y1
    const len = Math.hypot(dx, dy)
    if (len < 1) return
    // headLen scales with line width — w is already display-scaled by caller,
    // so the head ends up the same visible size on any device.
    const headLen = w * 3.5
    const ux = dx / len
    const uy = dy / len
    const baseX = x2 - ux * headLen
    const baseY = y2 - uy * headLen
    // shaft
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(baseX, baseY)
    ctx.stroke()
    // head
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

  // ---------- Text metrics helpers ----------

  function textFontPx(s, scale) {
    const w = s.width * scale
    return Math.max(14 * scale, w * 4)
  }
  function textFont(fontPx) {
    return `bold ${fontPx}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif`
  }
  function measureText(s, scale) {
    const canvas = canvasRef.current
    if (!canvas) return { w: 0, h: 0 }
    const ctx = canvas.getContext('2d')
    const fontPx = textFontPx(s, scale)
    ctx.font = textFont(fontPx)
    const m = ctx.measureText(s.text || '')
    return { w: m.width, h: fontPx * 1.2 }
  }

  // ---------- Coordinates ----------

  function ptFromEvent(e) {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const sx = canvas.width / rect.width
    const sy = canvas.height / rect.height
    return {
      x: (e.clientX - rect.left) * sx,
      y: (e.clientY - rect.top) * sy,
    }
  }

  // ---------- Hit testing ----------

  function distToSegment(p, a, b) {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
    t = Math.max(0, Math.min(1, t))
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
  }

  function hitShape(s, p, tolerance, scale) {
    if (s.type === 'arrow') {
      // shaft proximity OR inside the head
      const shaft = distToSegment(p, { x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 })
      if (shaft <= tolerance) return true
      // head ~= w*3.5 wide cone at (x2,y2)
      return Math.hypot(p.x - s.x2, p.y - s.y2) <= s.width * scale * 3.5
    }
    if (s.type === 'rect') {
      // Hit if anywhere within the rect (incl. interior) — mobile-friendly.
      const minX = Math.min(s.x1, s.x2) - tolerance
      const maxX = Math.max(s.x1, s.x2) + tolerance
      const minY = Math.min(s.y1, s.y2) - tolerance
      const maxY = Math.max(s.y1, s.y2) + tolerance
      return p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY
    }
    if (s.type === 'circle') {
      const cx = (s.x1 + s.x2) / 2
      const cy = (s.y1 + s.y2) / 2
      const rx = Math.abs(s.x2 - s.x1) / 2 + tolerance
      const ry = Math.abs(s.y2 - s.y1) / 2 + tolerance
      if (rx <= 0 || ry <= 0) return false
      const ndx = (p.x - cx) / rx
      const ndy = (p.y - cy) / ry
      return ndx * ndx + ndy * ndy <= 1
    }
    if (s.type === 'freehand') {
      const pts = s.points || []
      for (let i = 1; i < pts.length; i++) {
        if (distToSegment(p, pts[i - 1], pts[i]) <= tolerance) return true
      }
      return false
    }
    if (s.type === 'text') {
      const { w, h } = measureText(s, scale)
      return (
        p.x >= s.x1 - tolerance &&
        p.x <= s.x1 + w + tolerance &&
        p.y >= s.y1 - tolerance &&
        p.y <= s.y1 + h + tolerance
      )
    }
    return false
  }

  // ---------- Handles ----------

  function getHandles(s, scale) {
    if (s.type === 'arrow') {
      return [
        { x: s.x1, y: s.y1, role: 'p1' },
        { x: s.x2, y: s.y2, role: 'p2' },
      ]
    }
    if (s.type === 'rect' || s.type === 'circle') {
      return [
        { x: s.x1, y: s.y1, role: 'tl' },
        { x: s.x2, y: s.y1, role: 'tr' },
        { x: s.x2, y: s.y2, role: 'br' },
        { x: s.x1, y: s.y2, role: 'bl' },
      ]
    }
    if (s.type === 'text') {
      const { w, h } = measureText(s, scale)
      return [{ x: s.x1 + w, y: s.y1 + h, role: 'fontsize' }]
    }
    // freehand: no resize handles — too messy to redo points individually
    return []
  }

  function hitHandle(s, p, scale) {
    const handles = getHandles(s, scale)
    // Larger hit area than the visual handle (24 CSS px radius vs 10 visual)
    const r = 24 * scale
    for (const h of handles) {
      if (Math.hypot(p.x - h.x, p.y - h.y) <= r) return h
    }
    return null
  }

  // ---------- Selection overlay (dashed bbox + handles) ----------

  function drawSelectionOverlay(ctx, s, scale) {
    const bbox = getBbox(s, scale)
    if (!bbox) return
    ctx.save()
    ctx.strokeStyle = SELECTION_BLUE
    ctx.lineWidth = 2 * scale
    ctx.setLineDash([8 * scale, 4 * scale])
    const pad = 6 * scale
    ctx.strokeRect(bbox.minX - pad, bbox.minY - pad, bbox.maxX - bbox.minX + 2 * pad, bbox.maxY - bbox.minY + 2 * pad)
    ctx.setLineDash([])

    // Handles
    const handles = getHandles(s, scale)
    const r = 10 * scale
    for (const h of handles) {
      ctx.beginPath()
      ctx.arc(h.x, h.y, r, 0, Math.PI * 2)
      ctx.fillStyle = '#FFFFFF'
      ctx.fill()
      ctx.strokeStyle = SELECTION_BLUE
      ctx.lineWidth = 2 * scale
      ctx.stroke()
    }
    ctx.restore()
  }

  function getBbox(s, scale) {
    if (s.type === 'arrow' || s.type === 'rect' || s.type === 'circle') {
      return {
        minX: Math.min(s.x1, s.x2),
        maxX: Math.max(s.x1, s.x2),
        minY: Math.min(s.y1, s.y2),
        maxY: Math.max(s.y1, s.y2),
      }
    }
    if (s.type === 'freehand') {
      const pts = s.points || []
      if (pts.length === 0) return null
      let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y
      for (const pt of pts) {
        if (pt.x < minX) minX = pt.x
        if (pt.x > maxX) maxX = pt.x
        if (pt.y < minY) minY = pt.y
        if (pt.y > maxY) maxY = pt.y
      }
      return { minX, minY, maxX, maxY }
    }
    if (s.type === 'text') {
      const { w, h } = measureText(s, scale)
      return { minX: s.x1, minY: s.y1, maxX: s.x1 + w, maxY: s.y1 + h }
    }
    return null
  }

  // ---------- Mutation helpers ----------

  function moveShape(s, dx, dy) {
    if (s.type === 'arrow' || s.type === 'rect' || s.type === 'circle') {
      return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy }
    }
    if (s.type === 'text') {
      return { ...s, x1: s.x1 + dx, y1: s.y1 + dy }
    }
    if (s.type === 'freehand') {
      return { ...s, points: s.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })) }
    }
    return s
  }

  function resizeShape(s, role, p, scale) {
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
      // Drag handle further from text origin → bigger font.
      // Reverse of textFontPx: fontPx ≈ p.y - s.y1, width = fontPx / (4*scale).
      const dy = Math.max(20 * scale, p.y - s.y1)
      const newWidthCss = Math.max(6, Math.min(80, dy / (1.2 * 4 * scale)))
      return { ...s, width: newWidthCss }
    }
    return s
  }

  // ---------- Pointer flow ----------

  const onPointerDown = (e) => {
    e.preventDefault()
    canvasRef.current.setPointerCapture(e.pointerId)
    const p = ptFromEvent(e)
    const scale = getDisplayScale()
    const tolerance = 14 * scale // ~14 CSS px finger tolerance for shape hit

    // 1. Already-selected shape's handles take precedence
    if (selectedShape) {
      const h = hitHandle(selectedShape, p, scale)
      if (h) {
        setDrag({ kind: 'handle', startP: p, originalShape: selectedShape, handleRole: h.role })
        return
      }
    }

    // 2. Hit-test all shapes (last drawn first = top of z-order)
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i]
      if (hitShape(s, p, tolerance, scale)) {
        setSelectedId(s.id)
        setDrag({ kind: 'move', startP: p, originalShape: s })
        return
      }
    }

    // 3. Empty area — deselect, then start drawing new shape
    if (selectedId) setSelectedId(null)

    if (tool === 'text') {
      const text = window.prompt('Tekst:')
      if (text && text.trim()) {
        setShapes((arr) => [...arr, {
          id: newShapeId(),
          type: 'text', x1: p.x, y1: p.y, text: text.trim(), color, width,
        }])
      }
      return
    }
    if (tool === 'freehand') {
      setDrawing({ id: newShapeId(), type: 'freehand', points: [p], color, width })
    } else {
      setDrawing({ id: newShapeId(), type: tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y, color, width })
    }
  }

  const onPointerMove = (e) => {
    if (!drag && !drawing) return
    e.preventDefault()
    const p = ptFromEvent(e)
    const scale = getDisplayScale()

    if (drag) {
      if (drag.kind === 'move') {
        const dx = p.x - drag.startP.x
        const dy = p.y - drag.startP.y
        setShapes((arr) => arr.map((s) =>
          s.id === drag.originalShape.id ? moveShape(drag.originalShape, dx, dy) : s
        ))
      } else if (drag.kind === 'handle') {
        setShapes((arr) => arr.map((s) =>
          s.id === drag.originalShape.id ? resizeShape(drag.originalShape, drag.handleRole, p, scale) : s
        ))
      }
      return
    }

    setDrawing((d) => {
      if (!d) return d
      if (d.type === 'freehand') return { ...d, points: [...d.points, p] }
      return { ...d, x2: p.x, y2: p.y }
    })
  }

  const onPointerUp = (e) => {
    if (drag) {
      e.preventDefault()
      setDrag(null)
      return
    }
    if (!drawing) return
    e.preventDefault()
    // Discard tiny accidental strokes
    if (drawing.type !== 'freehand') {
      const dx = drawing.x2 - drawing.x1
      const dy = drawing.y2 - drawing.y1
      if (Math.hypot(dx, dy) < 5) { setDrawing(null); return }
    } else if ((drawing.points || []).length < 2) {
      setDrawing(null); return
    }
    setShapes((arr) => [...arr, drawing])
    setDrawing(null)
  }

  // ---------- Toolbar actions ----------

  const undo = () => {
    setShapes((arr) => arr.slice(0, -1))
    setSelectedId(null)
  }
  const clear = () => {
    if (shapes.length === 0) return
    if (window.confirm('Usunąć wszystkie adnotacje?')) {
      setShapes([])
      setSelectedId(null)
    }
  }
  const deleteSelected = () => {
    if (!selectedId) return
    setShapes((arr) => arr.filter((s) => s.id !== selectedId))
    setSelectedId(null)
  }
  const editSelectedText = () => {
    if (!selectedShape || selectedShape.type !== 'text') return
    const next = window.prompt('Tekst:', selectedShape.text || '')
    if (next === null) return // cancelled
    if (!next.trim()) {
      // Empty → treat as delete
      deleteSelected()
      return
    }
    setShapes((arr) => arr.map((s) =>
      s.id === selectedId ? { ...s, text: next.trim() } : s
    ))
  }

  // Color/width changes: apply to selected shape (if any) AND update next-draw default
  const handleColorChange = (newColor) => {
    setColor(newColor)
    if (selectedId) {
      setShapes((arr) => arr.map((s) =>
        s.id === selectedId ? { ...s, color: newColor } : s
      ))
    }
  }
  const handleWidthChange = (newWidth) => {
    setWidth(newWidth)
    if (selectedId) {
      setShapes((arr) => arr.map((s) =>
        s.id === selectedId ? { ...s, width: newWidth } : s
      ))
    }
  }

  // Save: re-render clean (no selection overlay, no in-progress shape) then snapshot.
  const save = () => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const scale = getDisplayScale()
    for (const s of shapes) drawShape(ctx, s, scale)
    canvas.toBlob((blob) => {
      if (!blob) {
        // Older browsers / very edge cases — fall back to dataURL → Blob conversion.
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
        fetch(dataUrl).then((r) => r.blob()).then(onSave)
        return
      }
      onSave(blob)
    }, 'image/jpeg', 0.9)
  }

  return (
    <div className="fixed inset-0 bg-black z-[60] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-900 text-white">
        <button onClick={onCancel} className="text-sm px-3 py-1.5 rounded bg-white/10 hover:bg-white/20">
          Anuluj
        </button>
        <div className="text-sm font-medium">
          {selectedShape ? 'Edycja zaznaczonego' : 'Adnotacje'}
        </div>
        <button onClick={save} className="text-sm px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 font-medium">
          Zapisz
        </button>
      </div>

      {/* Canvas area */}
      <div className="flex-1 flex items-center justify-center overflow-hidden bg-gray-800 p-2">
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            touchAction: 'none',
            background: '#000',
            boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
            cursor: selectedShape ? 'move' : 'crosshair',
          }}
        />
      </div>

      {/* Bottom toolbar */}
      <div className="bg-gray-900 text-white px-2 py-2 space-y-2">
        <div className="flex gap-1 overflow-x-auto">
          {TOOLS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTool(t.key)}
              className={
                'flex-1 min-w-[64px] px-2 py-2 rounded text-xs flex flex-col items-center gap-0.5 transition ' +
                (tool === t.key ? 'bg-sure-blue text-white' : 'bg-white/10 hover:bg-white/20')
              }
            >
              <span className="text-base leading-none">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        <div className="flex gap-1 items-center">
          <div className="text-[10px] uppercase tracking-wider text-white/60 mr-1">Kolor</div>
          {COLORS.map((c) => (
            <button
              key={c.key}
              onClick={() => handleColorChange(c.value)}
              className={
                'w-8 h-8 rounded-full border-2 transition ' +
                (color === c.value ? 'border-white scale-110' : 'border-white/30')
              }
              style={{ background: c.value }}
              aria-label={c.key}
            />
          ))}
        </div>

        <div className="flex gap-1 items-center">
          <div className="text-[10px] uppercase tracking-wider text-white/60 mr-1">Grubość</div>
          {WIDTHS.map((w) => (
            <button
              key={w.key}
              onClick={() => handleWidthChange(w.px)}
              className={
                'flex-1 px-2 py-1.5 rounded text-xs transition ' +
                (width === w.px ? 'bg-sure-blue text-white' : 'bg-white/10 hover:bg-white/20')
              }
            >
              {w.label}
            </button>
          ))}
          <button
            onClick={undo}
            disabled={shapes.length === 0}
            className="px-3 py-1.5 rounded text-xs bg-white/10 hover:bg-white/20 disabled:opacity-30"
            title="Cofnij"
          >
            ↶ Cofnij
          </button>
          <button
            onClick={clear}
            disabled={shapes.length === 0}
            className="px-3 py-1.5 rounded text-xs bg-red-700/60 hover:bg-red-700 disabled:opacity-30"
          >
            Wyczyść
          </button>
        </div>

        {/* Selection action row — only shows when something is selected */}
        {selectedShape && (
          <div className="flex gap-1 items-center pt-1 border-t border-white/10">
            <div className="text-[10px] uppercase tracking-wider text-sky-300 mr-1">Zaznaczone</div>
            {selectedShape.type === 'text' && (
              <button
                onClick={editSelectedText}
                className="px-3 py-1.5 rounded text-xs bg-sky-700 hover:bg-sky-600"
              >
                ✎ Edytuj tekst
              </button>
            )}
            <button
              onClick={() => setSelectedId(null)}
              className="px-3 py-1.5 rounded text-xs bg-white/10 hover:bg-white/20"
            >
              Odznacz
            </button>
            <button
              onClick={deleteSelected}
              className="ml-auto px-3 py-1.5 rounded text-xs bg-red-600 hover:bg-red-700 font-medium"
            >
              🗑 Usuń zaznaczony
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
