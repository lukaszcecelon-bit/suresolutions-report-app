import { useEffect, useRef, useState } from 'react'
import { compressImageFile } from '../../utils/imageCompressor.js'
import { newId } from '../../utils/storage.js'
import { putImage, getImages, deleteImage, putVideo, deleteVideo } from '../../utils/imageStore.js'

function fmtSize(bytes) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

export default function MediaUploader({ media = [], onChange, compact = false, photoOnly = false }) {
  const photoCamInput = useRef(null)
  const videoCamInput = useRef(null)
  const galleryInput = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // cache: photoId → dataUrl, used purely for rendering thumbnails
  const [resolved, setResolved] = useState({})

  // Load dataUrls from IndexedDB for any photoIds we don't yet have cached.
  useEffect(() => {
    const ids = (media || [])
      .filter((m) => m.kind === 'image' && m.photoId)
      .map((m) => m.photoId)
    const missing = ids.filter((id) => !(id in resolved))
    if (missing.length === 0) return
    let cancelled = false
    getImages(missing)
      .then((map) => {
        if (cancelled) return
        setResolved((prev) => {
          const next = { ...prev }
          for (const [id, url] of map) next[id] = url
          return next
        })
      })
      .catch((e) => console.warn('getImages failed', e))
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media])

  const addItems = (items) => {
    onChange([...(media || []), ...items])
  }

  const updateItem = (id, patch) => {
    onChange((media || []).map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }

  const removeItem = (id) => {
    const m = (media || []).find((x) => x.id === id)
    onChange((media || []).filter((x) => x.id !== id))
    if (m?.photoId) {
      deleteImage(m.photoId).catch((e) => console.warn('deleteImage failed', e))
    }
    if (m?.videoId) {
      deleteVideo(m.videoId).catch((e) => console.warn('deleteVideo failed', e))
    }
  }

  const handleFiles = async (files) => {
    if (!files || files.length === 0) return
    setBusy(true)
    setError('')
    try {
      const out = []
      const newlyResolved = {}
      for (const f of files) {
        if (f.type.startsWith('image/')) {
          const c = await compressImageFile(f)
          const photoId = await putImage(c.dataUrl)
          newlyResolved[photoId] = c.dataUrl
          out.push({
            id: newId(),
            kind: 'image',
            photoId,
            filename: f.name,
            description: '',
          })
        } else if (f.type.startsWith('video/') && !photoOnly) {
          const videoId = await putVideo(f)
          out.push({
            id: newId(),
            kind: 'video',
            videoId,
            filename: f.name,
            mimeType: f.type,
            size: f.size,
            description: '',
          })
        }
      }
      if (Object.keys(newlyResolved).length > 0) {
        setResolved((prev) => ({ ...prev, ...newlyResolved }))
      }
      if (out.length > 0) addItems(out)
    } catch (e) {
      setError(e.message || 'Błąd przetwarzania pliku')
    } finally {
      setBusy(false)
    }
  }

  const onPick = (e) => {
    handleFiles(Array.from(e.target.files || []))
    e.target.value = ''
  }

  const dataUrlFor = (m) => m.dataUrl || (m.photoId ? resolved[m.photoId] : '') || ''

  const imageItems = (media || []).filter((m) => m.kind === 'image')
  const videoItems = (media || []).filter((m) => m.kind === 'video')

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input
          ref={photoCamInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onPick}
        />
        <input
          ref={videoCamInput}
          type="file"
          accept="video/*"
          capture="environment"
          className="hidden"
          onChange={onPick}
        />
        <input
          ref={galleryInput}
          type="file"
          accept={photoOnly ? 'image/*' : 'image/*,video/*'}
          multiple
          className="hidden"
          onChange={onPick}
        />
        <button
          type="button"
          onClick={() => photoCamInput.current?.click()}
          disabled={busy}
          className="btn-secondary text-sm py-2 px-3 flex-1 min-w-[140px]"
        >
          📷 Zrób zdjęcie
        </button>
        {!photoOnly && (
          <button
            type="button"
            onClick={() => videoCamInput.current?.click()}
            disabled={busy}
            className="btn-secondary text-sm py-2 px-3 flex-1 min-w-[140px]"
          >
            🎬 Nagraj wideo
          </button>
        )}
        <button
          type="button"
          onClick={() => galleryInput.current?.click()}
          disabled={busy}
          className="btn-secondary text-sm py-2 px-3 flex-1 min-w-[140px]"
        >
          🖼 {photoOnly ? 'Wybierz zdjęcie' : 'Wybierz z galerii'}
        </button>
      </div>

      {busy && <div className="text-sm text-gray-500">Przetwarzanie…</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}

      {imageItems.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {imageItems.map((m, i) => {
            const url = dataUrlFor(m)
            return (
              <div key={m.id} className="relative border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                <div className="absolute top-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded z-10">
                  Zdj. {i + 1}
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(m.id)}
                  className="absolute top-1 right-1 bg-red-600 hover:bg-red-700 text-white w-6 h-6 rounded-full text-xs flex items-center justify-center z-10"
                  aria-label="Usuń zdjęcie"
                >
                  ✕
                </button>
                {url ? (
                  <img src={url} alt={m.filename} className="w-full h-32 object-cover" />
                ) : (
                  <div className="w-full h-32 flex items-center justify-center text-xs text-gray-400">Ładowanie…</div>
                )}
                <input
                  type="text"
                  placeholder="Opis (opcjonalny)"
                  value={m.description || ''}
                  onChange={(e) => updateItem(m.id, { description: e.target.value })}
                  className="w-full text-xs px-2 py-1.5 border-t border-gray-200 focus:outline-none"
                />
              </div>
            )
          })}
        </div>
      )}

      {videoItems.length > 0 && (
        <div className="space-y-2">
          {videoItems.map((m, i) => (
            <div key={m.id} className="border border-gray-200 rounded-lg p-2 bg-gray-50 flex items-start gap-2">
              <div className="text-2xl">🎬</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium flex items-center gap-2">
                  <span>Wideo {i + 1}</span>
                  {m.size > 0 && <span className="text-xs text-gray-400 font-normal">({fmtSize(m.size)})</span>}
                </div>
                <div className="text-xs text-gray-500 truncate" title={m.filename}>
                  Plik: {m.filename}
                </div>
                <input
                  type="text"
                  placeholder="Opis wideo (opcjonalny)"
                  value={m.description || ''}
                  onChange={(e) => updateItem(m.id, { description: e.target.value })}
                  className="mt-1 w-full text-xs px-2 py-1.5 border border-gray-200 rounded focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => removeItem(m.id)}
                className="bg-red-600 hover:bg-red-700 text-white w-6 h-6 rounded-full text-xs flex items-center justify-center flex-shrink-0"
                aria-label="Usuń wideo"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
