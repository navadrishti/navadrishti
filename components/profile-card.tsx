import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { UserPlus } from "lucide-react"
import { ReactNode } from "react"

interface ProfileCardProps {
  // Original props
  name?: string
  role?: string
  company?: string
  avatar?: string
  connections?: number
  skills?: string[]
  
  // Alternative props (for NGOs and other use cases)
  image?: string
  title?: string
  subtitle?: string
  description?: string
  tags?: string[]
  footer?: ReactNode
  badge?: ReactNode
}

export function ProfileCard({ 
  // Original props
  name, 
  role, 
  company, 
  avatar, 
  connections, 
  skills,
  
  // Alternative props
  image,
  title,
  subtitle,
  description,
  tags,
  footer,
  badge
}: ProfileCardProps) {
  
  // Generate initials for avatar fallback
  const getInitials = (name: string) => {
    if (!name) return "U"
    const names = name.split(' ')
    if (names.length === 1) return names[0].charAt(0).toUpperCase()
    return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase()
  }
  
  // Use either name or title for display
  const displayName = name || title || "User"
  
  // Use either avatar or image for the profile picture
  const profileImage = avatar || image
  
  // Use either skills or tags for the badges
  const displayTags = skills || tags || []

  return (
    <Card className="overflow-hidden group">
      <CardHeader className="p-0">
        <div className="h-24 bg-gradient-to-r from-blue-500 to-purple-600 relative">
          <div className="absolute inset-0 bg-white/10 backdrop-blur-[2px] transition-all duration-500 group-hover:backdrop-blur-none"></div>
          {badge}
        </div>
      </CardHeader>
      <CardContent className="p-6 pt-0">
        <div className="flex justify-between -mt-12">
          <Avatar className="h-20 w-20 border-4 border-background shadow-lg transition-transform duration-500 ease-out group-hover:scale-105 group-hover:shadow-xl">
            <AvatarImage src={profileImage} alt={displayName} />
            <AvatarFallback className="bg-gradient-to-br from-blue-400 to-indigo-500 text-white font-semibold">{getInitials(displayName)}</AvatarFallback>
          </Avatar>
          {!footer && (
            <Button 
              size="sm" 
              variant="outline" 
              className="mt-12 gap-1 backdrop-blur-sm bg-white/70 dark:bg-slate-800/70 hover:bg-white/90 dark:hover:bg-slate-800/90 transition-all duration-300 ease-in-out hover:shadow-md"
            >
              <UserPlus className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" />
              Connect
            </Button>
          )}
        </div>
        <div className="mt-3 space-y-2">
          <h3 className="font-semibold text-lg text-gradient">{displayName}</h3>
          {(role && company) ? (
            <p className="text-sm text-muted-foreground animate-slideIn"
               style={{ animationDelay: '100ms' }}>{role} at {company}</p>
          ) : subtitle ? (
            <p className="text-sm text-muted-foreground animate-slideIn"
               style={{ animationDelay: '100ms' }}>{subtitle}</p>
          ) : null}
          
          {connections && (
            <p className="text-sm animate-slideIn"
               style={{ animationDelay: '150ms' }}>{connections} connections</p>
          )}
          
          {description && (
            <p className="text-sm text-gray-500 animate-slideIn"
               style={{ animationDelay: '150ms' }}>{description}</p>
          )}
          
          <div className="flex flex-wrap gap-1 pt-2">
            {displayTags.map((tag, index) => (
              <Badge 
                key={index} 
                variant="secondary" 
                className="bg-gradient-to-r from-blue-100 to-indigo-100 text-white bg-blue-500 dark:from-blue-900/30 dark:to-indigo-900/30 dark:text-white backdrop-blur-sm border-opacity-30 transition-all duration-300 ease-in-out hover:scale-105"
                style={{ animationDelay: `${200 + index * 50}ms`, animation: 'fadeIn 0.5s ease-out forwards' }}
              >
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
      <CardFooter className="border-t border-opacity-20 p-4">
        {footer || (
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full hover:bg-white/20 dark:hover:bg-slate-800/20 transition-all duration-300 ease-in-out"
          >
            View Profile
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

