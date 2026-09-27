"use client"

import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command"
import { VerificationBadge } from "@/components/verification-badge"
import { getGramAvatarFallbackStyle } from "@/lib/gram-avatar"
import { getInitials } from "./nav-config"
import type { ProfileSearch } from "./use-profile-search"

const VARIANT_STYLES = {
  sidebar: {
    command: { className: "!bg-white", style: { backgroundColor: 'white' } },
    listExpanded: "!bg-white max-h-80 overflow-y-auto",
    listCollapsed: "!bg-white",
    group: "!bg-white",
    item: "cursor-pointer p-4 hover:bg-gram-soft data-[selected=true]:bg-gram-soft data-[selected=true]:text-gray-900 transition-colors",
    badgeVariant: "outline",
    badge: "text-xs capitalize rounded-full px-2 py-1 !bg-white !text-gray-800 border-gray-300 hover:!bg-white hover:!text-gray-800",
    showIdleHint: true,
  },
  sheet: {
    command: {},
    listExpanded: "max-h-80 overflow-y-auto",
    listCollapsed: "",
    group: undefined,
    item: "cursor-pointer p-4 hover:bg-gray-50 transition-colors",
    badgeVariant: "secondary",
    badge: "text-xs capitalize bg-blue-100 text-blue-800 border border-blue-300 rounded-full px-2 py-1",
    showIdleHint: false,
  },
} as const

export function ProfileSearchResults({
  search,
  variant,
}: {
  search: ProfileSearch
  variant: keyof typeof VARIANT_STYLES
}) {
  const { searchQuery, searchResults, isSearching, showAllResults, setShowAllResults, handleProfileSelect } = search
  const styles = VARIANT_STYLES[variant]

  return (
    <Command shouldFilter={false} {...styles.command}>
      <CommandList className={showAllResults ? styles.listExpanded : styles.listCollapsed}>
        {isSearching ? (
          <div className="p-4 text-center text-muted-foreground">
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Searching...
            </div>
          </div>
        ) : searchQuery.length >= 1 && searchResults.length > 0 ? (
          <>
            <CommandGroup className={styles.group} heading={searchResults.length > 3 && !showAllResults ? `Top 3 of ${searchResults.length} profiles` : `Found ${searchResults.length} profile${searchResults.length > 1 ? 's' : ''}`}>
              {(showAllResults ? searchResults : searchResults.slice(0, 3)).map((profile) => (
                <CommandItem
                  key={profile.id}
                  value={profile.name}
                  onSelect={() => handleProfileSelect(profile)}
                  className={styles.item}
                >
                  <div className="flex items-center gap-3 w-full">
                    <Avatar className="h-10 w-10 flex-shrink-0">
                      {profile.profile_image && (
                        <AvatarImage src={profile.profile_image} alt={profile.name} />
                      )}
                      <AvatarFallback
                        className="text-xs font-semibold"
                        style={getGramAvatarFallbackStyle(profile.name)}
                      >
                        {getInitials(profile.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{profile.name}</span>
                        {profile.verification_status === 'verified' && (
                          <VerificationBadge status="verified" size="sm" showText={false} />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant={styles.badgeVariant} className={styles.badge}>
                          {profile.user_type}
                        </Badge>
                        {profile.location && (
                          <span className="text-xs text-muted-foreground truncate">{profile.location}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            {searchResults.length > 3 && (
              <div className="border-t border-gray-200 p-2">
                {!showAllResults ? (
                  <Button
                    variant="ghost"
                    className="w-full text-sm text-primary hover:text-primary/80 hover:bg-gram-soft"
                    onClick={() => setShowAllResults(true)}
                  >
                    View all {searchResults.length} profiles
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    className="w-full text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-50"
                    onClick={() => setShowAllResults(false)}
                  >
                    Show less
                  </Button>
                )}
              </div>
            )}
          </>
        ) : searchQuery.length >= 1 ? (
          <div className="p-4 text-center">
            <p className="text-muted-foreground text-sm">No profiles found for "{searchQuery}"</p>
            <p className="text-xs text-muted-foreground mt-1">Try searching for names, organizations, or locations</p>
          </div>
        ) : styles.showIdleHint ? (
          <div className="p-4 text-center text-muted-foreground">
            <p className="text-sm">Type to search profiles</p>
            <p className="text-xs mt-1">Search for people, NGOs, or companies</p>
          </div>
        ) : null}
      </CommandList>
    </Command>
  )
}
