import { usePinchZoom } from './use-pinch-zoom'

export function DocumentPreview({
  src,
  alt,
  isImage,
}: {
  src: string
  alt: string
  isImage: boolean
}) {
  const { scale, frameRef } = usePinchZoom(src)

  return (
    <div
      ref={frameRef}
      className="h-[70vh] overflow-auto overscroll-contain rounded-lg border border-slate-200 bg-slate-50"
      style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x pan-y' }}
      onWheel={(event) => event.stopPropagation()}
      onTouchMove={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- verification documents are signed URLs rendered at natural size
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="block h-auto max-w-none select-none"
          style={{ width: `${scale * 100}%` }}
        />
      ) : (
        <iframe
          title={alt}
          src={src}
          className="block border-0"
          style={{ width: `${scale * 100}%`, height: `${Math.max(140, scale * 140)}vh` }}
        />
      )}
    </div>
  )
}
