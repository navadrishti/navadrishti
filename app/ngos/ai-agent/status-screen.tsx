"use client"

import { Loader2 } from "lucide-react"
import { Header } from "@/components/header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type StatusScreenProps = {
  title: string
  description: string
  loadingMessage?: string
}

export function StatusScreen({ title, description, loadingMessage }: StatusScreenProps) {
  return (
    <>
      <Header />
      <main className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          {loadingMessage ? (
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                {loadingMessage}
              </div>
            </CardContent>
          ) : null}
        </Card>
      </main>
    </>
  )
}
