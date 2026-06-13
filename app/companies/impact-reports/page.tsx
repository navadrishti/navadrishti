"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { Header } from "@/components/header"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ImpactReportsPanel } from "@/components/companies/impact-reports-panel"

export default function ImpactReportsPage() {
  const { user } = useAuth()
  const [isHydrated, setIsHydrated] = useState(false)

  const effectiveUserType = isHydrated ? user?.user_type : undefined

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  if (!isHydrated) {
    return (
      <>
        <Header />
        <div className="container mx-auto px-4 py-8">
          <Card>
            <CardHeader>
              <CardTitle>Loading Impact Reports</CardTitle>
              <CardDescription>Preparing your workspace...</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </>
    )
  }

  if (effectiveUserType !== 'company') {
    return (
      <>
        <Header />
        <div className="container mx-auto px-4 py-8">
          <Card>
            <CardHeader>
              <CardTitle>Access Denied</CardTitle>
              <CardDescription>This feature is only available for company accounts.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </>
    )
  }

  return (
    <>
      <Header />
      <div className="container mx-auto px-4 py-8">
        <ImpactReportsPanel />
      </div>
    </>
  )
}
