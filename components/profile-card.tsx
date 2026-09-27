import { cn } from "@/lib/utils"

export function ProfileCoverMedia({
  src,
  className,
  alt = "",
}: {
  src?: string | null
  className?: string
  alt?: string
}) {
  return (
    <div className={cn("relative overflow-hidden bg-gradient-to-r from-gram-sidebar to-gram-sidebar-surface", className)}>
      {src ? (
        <img src={src} alt={alt} className="absolute inset-0 h-full w-full object-cover" />
      ) : null}
    </div>
  )
}
