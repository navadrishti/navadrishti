"use client"

import { ArrowLeft } from "lucide-react"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export function ProfileLoadingView() {
  return (
    <>
      <Header />
      <div className="container mx-auto px-4 py-8">
        <Card className="mb-8 overflow-hidden animate-pulse">
          <div className="h-36 bg-slate-100 sm:h-48" />
          <CardContent className="pt-6">
            <div className="flex flex-col gap-6 md:flex-row">
              <div className="-mt-16 h-32 w-32 rounded-full border-4 border-white bg-slate-100" />
              <div className="flex-1 space-y-4">
                <div className="h-9 w-64 rounded bg-slate-100" />
                <div className="h-4 w-48 rounded bg-slate-100" />
                <div className="h-4 w-56 rounded bg-slate-100" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="animate-pulse">
          <CardContent className="space-y-4 py-6">
            <div className="h-5 w-40 rounded bg-slate-100" />
            <div className="h-4 w-full rounded bg-slate-100" />
            <div className="h-4 w-5/6 rounded bg-slate-100" />
          </CardContent>
        </Card>
      </div>
    </>
  )
}

export function ProfileErrorView({ message }: { message: string }) {
  return (
    <>
      <Header />
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="py-12 pt-6 text-center">
            <p className="mb-4 text-red-600">{message}</p>
            <Button
              onClick={() => window.history.back()}
              className="hover:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 active:bg-transparent"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
