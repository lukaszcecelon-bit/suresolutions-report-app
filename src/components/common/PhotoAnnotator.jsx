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

// `source` can be either a dataURL (string starting with "data:") or an object URL
// for a Blob/File. The annotator draws on a canvas at the image's native resolution
// so the saved Blob preserves the full quality of the original.
export default function PhotoAnnotator({ source, onSave, onCancel }) {
  const canvasRef = useRef(null)
  const imgRef = useRef(null)
  const [tool, setTool] = useState('arrow')
  const [color, setColor] = useState(COLORS[0].value)
  const [width, setWidth] = useState(WIDTHS[1].px)
  const [shapes, setShapes] = useState([])
  const [drawing, setDrawing] = useState(null) // shape being drawn

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

  // Redraw on every shape change
  useEffect(() => { redraw(drawing ? [...shapes, drawing] : shapes) }, [shapes, drawing])

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
  }, [shapes, drawing])

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
      const w = Math.abs(s.x2 - s.x1)
      const h = Math.abs(s.y2 - s.y1)
      ctx.strokeRect(x, y, w, h)
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
      const fontPx = Math.max(14 * scale, w * 4)
      ctx.font = `bold ${fontPx}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif`
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

  const onPointerDown = (e) => {
    e.preventDefault()
    canvasRef.current.setPointerCapture(e.pointerId)
    const p = ptFromEvent(e)
    if (tool === 'text') {
      const text = window.prompt('Tekst:')
      if (text && text.trim()) {
        setShapes((arr) => [...arr, {
          type: 'text', x1: p.x, y1: p.y, text: text.trim(), color, width,
        }])
      }
      return
    }
    if (tool === 'freehand') {
      setDrawing({ type: 'freehand', points: [p], color, width })
    } else {
      setDrawing({ type: tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y, color, width })
    }
  }

  const onPointerMove = (e) => {
    if (!drawing) return
    e.preventDefault()
    const p = ptFromEvent(e)
    setDrawing((d) => {
      if (!d) return d
      if (d.type === 'freehand') return { ...d, points: [...d.points, p] }
      return { ...d, x2: p.x, y2: p.y }
    })
  }

  const onPointerUp = (e) => {
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

  const undo = () => setShapes((arr) => arr.slice(0, -1))
  const clear = () => {
    if (shapes.length === 0) return
    if (window.confirm('Usunąć wszystkie adnotacje?')) setShapes([])
  }

  const save = () => {
    const canvas = canvasRef.current
    if (!canvas || !imgRef.current) return
    // Re-render once cleanly (without any in-progress shape)
    redraw(shapes)
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
        <div className="text-sm font-medium">Adnotacje</div>
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
            cursor: 'crosshair',
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
              onClick={() => setColor(c.value)}
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
              onClick={() => setWidth(w.px)}
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
      </div>
    </div>
  )
}
