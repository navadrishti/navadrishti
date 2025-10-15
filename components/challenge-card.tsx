import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar, Trophy, Users } from "lucide-react"

interface ChallengeCardProps {
  title: string
  organizer: string
  deadline: string
  prize: string
  participants: number
  tags: string[]
}

export function ChallengeCard({ title, organizer, deadline, prize, participants, tags }: ChallengeCardProps) {
  return (
    <Card className="group">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg text-gradient">{title}</CardTitle>
          <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 border-0 transition-all duration-300 ease-in-out">
            <span className="animate-pulse-subtle">Active</span>
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground animate-slideIn"
           style={{ animationDelay: '50ms' }}>Organized by {organizer}</p>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="space-y-3">
          <div className="flex items-center gap-2 group-hover:translate-x-1 transition-all duration-300 ease-out"
               style={{ animationDelay: '100ms', animation: 'fadeIn 0.5s ease-out forwards' }}>
            <Calendar className="h-4 w-4 text-blue-500" />
            <span className="text-sm">Deadline: {deadline}</span>
          </div>
          <div className="flex items-center gap-2 group-hover:translate-x-1 transition-all duration-300 ease-out"
               style={{ animationDelay: '150ms', animation: 'fadeIn 0.5s ease-out forwards' }}>
            <Trophy className="h-4 w-4 text-amber-500" />
            <span className="text-sm">Prize: {prize}</span>
          </div>
          <div className="flex items-center gap-2 group-hover:translate-x-1 transition-all duration-300 ease-out"
               style={{ animationDelay: '200ms', animation: 'fadeIn 0.5s ease-out forwards' }}>
            <Users className="h-4 w-4 text-indigo-500" />
            <span className="text-sm">{participants} participants</span>
          </div>
          <div className="flex flex-wrap gap-1 pt-2">
            {tags.map((tag, index) => (
              <Badge 
                key={index} 
                variant="outline" 
                className="backdrop-blur-sm bg-white/10 dark:bg-slate-900/10 border-opacity-30 hover:bg-white/20 dark:hover:bg-slate-900/20 transition-all duration-300 ease-in-out hover:scale-105"
                style={{ animationDelay: `${250 + index * 50}ms`, animation: 'fadeIn 0.5s ease-out forwards' }}
              >
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
      <CardFooter className="border-t border-opacity-20 p-4">
        <Button 
          className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 transition-all duration-500 ease-in-out hover:shadow-lg group-hover:scale-[1.02]"
        >
          Join Challenge
        </Button>
      </CardFooter>
    </Card>
  )
}

