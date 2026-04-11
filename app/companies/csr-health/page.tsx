"use client"

import { useEffect, useMemo, useState } from "react"
import { Header } from "@/components/header"
import { useAuth } from "@/lib/auth-context"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Activity, Clock3, Loader2 } from "lucide-react"

type CSRProject = {
  id: string
  title: string
  project_status?: string
  completed_milestones_count?: number
  milestones_count?: number
  next_milestone?: {
    title?: string
    due_date?: string
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export default function CompanyCSRHealthPage() {
  const { user } = useAuth()
  const [isHydrated, setIsHydrated] = useState(false)
  const [projects, setProjects] = useState<CSRProject[]>([])
  const [loading, setLoading] = useState(true)

  const effectiveUserType = isHydrated ? user?.user_type : undefined

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        setLoading(true)
        const token = localStorage.getItem("token")

        if (!token) {
          setProjects([])
          return
        }

        const response = await fetch("/api/csr-projects", {
          headers: {
            Authorization: `Bearer ${token}`
          }
        })

        const payload = await response.json()
        if (response.ok && payload?.success) {
          setProjects(Array.isArray(payload.data) ? payload.data : [])
        } else {
          setProjects([])
        }
      } catch {
        setProjects([])
      } finally {
        setLoading(false)
      }
    }

    fetchProjects()
  }, [])

  const health = useMemo(() => {
    const totalProjects = projects.length

    let totalMilestones = 0
    let totalCompleted = 0
    let delayedProjects = 0

    const now = new Date()

    for (const project of projects) {
      const milestones = Number(project.milestones_count ?? 0)
      const completed = Number(project.completed_milestones_count ?? 0)
      totalMilestones += milestones
      totalCompleted += completed

      const due = project.next_milestone?.due_date ? new Date(project.next_milestone.due_date) : null
      if (due && due.getTime() < now.getTime() && completed < milestones) {
        delayedProjects += 1
      }
    }

    const completionRatio = totalMilestones > 0 ? totalCompleted / totalMilestones : 0
    const delayRatio = totalProjects > 0 ? delayedProjects / totalProjects : 0

    const rawScore = 100 - Math.round((1 - completionRatio) * 45 + delayRatio * 35 + (totalProjects === 0 ? 20 : 0))
    const score = clamp(rawScore, 0, 100)

    const actions: string[] = []
    if (totalProjects === 0) actions.push("Create your first CSR project to start tracking execution health.")
    if (totalMilestones > 0 && completionRatio < 0.6) actions.push("Milestone completion is below 60%. Prioritize project execution reviews.")
    if (delayedProjects > 0) actions.push(`${delayedProjects} project${delayedProjects > 1 ? "s are" : " is"} behind schedule. Review next milestone due dates.`)
    if (actions.length === 0) actions.push("Execution health looks strong. Keep evidence and payment cycles on schedule.")

    return {
      score,
      totalProjects,
      totalMilestones,
      totalCompleted,
      delayedProjects,
      actions: actions.slice(0, 2)
    }
  }, [projects])

  if (effectiveUserType !== "company") {
    return (
      <>
        <Header />
        <main className="container mx-auto px-4 py-10">
          <Card>
            <CardHeader>
              <CardTitle>Access Denied</CardTitle>
              <CardDescription>This page is only available for company accounts.</CardDescription>
            </CardHeader>
          </Card>
        </main>
      </>
    )
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-slate-50 px-4 py-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">CSR Health Snapshot</h1>
              <p className="mt-1 text-slate-600">A pilot one-glance score for CSR execution quality and delivery risk.</p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center rounded-xl border bg-white p-16">
              <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
            </div>
          ) : (
            <>
              <Card className="border-2 border-slate-200 bg-white">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-slate-900">
                    <Activity className="h-5 w-5 text-udaan-orange" />
                    Overall CSR Health Score
                  </CardTitle>
                  <CardDescription>Composite score using milestone completion and schedule consistency.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                    <div>
                      <p className="text-6xl font-black tracking-tight text-slate-900">{health.score}</p>
                      <p className="mt-1 text-sm text-slate-500">out of 100</p>
                    </div>
                    <p className="text-sm text-slate-600">Projects tracked: {health.totalProjects}</p>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-slate-600">Milestone Completion</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-slate-900">{health.totalCompleted}/{health.totalMilestones}</p>
                    <p className="mt-1 text-xs text-slate-500">completed milestones</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-slate-600">Delayed Projects</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-slate-900">{health.delayedProjects}</p>
                    <p className="mt-1 text-xs text-slate-500">next milestone overdue</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-slate-900">
                    <Clock3 className="h-5 w-5 text-udaan-orange" />
                    Top Action Items
                  </CardTitle>
                  <CardDescription>Suggested next actions from current project data.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {health.actions.map((action, index) => (
                    <div key={index} className="rounded-md border bg-slate-50 p-3 text-sm text-slate-700">
                      {action}
                    </div>
                  ))}

                  <div className="pt-3">
                    <Button variant="outline" asChild>
                      <a href="/companies/dashboard?tab=csr-projects">Open CSR Projects</a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>
    </>
  )
}
