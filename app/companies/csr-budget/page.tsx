"use client"

import { useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Slider } from "@/components/ui/slider"
import { PieChart, TrendingUp, DollarSign, Plus, Trash2 } from "lucide-react"

interface BudgetCategory {
  id: string
  name: string
  amount: number
  percentage: number
  color: string
}

export default function CSRBudgetPage() {
  const { user } = useAuth()
  const [totalBudget, setTotalBudget] = useState(1000000)
  const [categories, setCategories] = useState<BudgetCategory[]>([
    { id: '1', name: 'Education', amount: 400000, percentage: 40, color: '#FF6B35' },
    { id: '2', name: 'Healthcare', amount: 300000, percentage: 30, color: '#004E89' },
    { id: '3', name: 'Environment', amount: 200000, percentage: 20, color: '#00A676' },
    { id: '4', name: 'Women Empowerment', amount: 100000, percentage: 10, color: '#F77F00' },
  ])

  const updateCategory = (id: string, percentage: number) => {
    const newAmount = (totalBudget * percentage) / 100
    setCategories(categories.map(cat => 
      cat.id === id ? { ...cat, percentage, amount: newAmount } : cat
    ))
  }

  const addCategory = () => {
    const newCategory: BudgetCategory = {
      id: Date.now().toString(),
      name: 'New Category',
      amount: 0,
      percentage: 0,
      color: '#' + Math.floor(Math.random()*16777215).toString(16)
    }
    setCategories([...categories, newCategory])
  }

  const removeCategory = (id: string) => {
    setCategories(categories.filter(cat => cat.id !== id))
  }

  const totalAllocated = categories.reduce((sum, cat) => sum + cat.percentage, 0)
  const remaining = 100 - totalAllocated

  if (user?.user_type !== 'company') {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>This feature is only available for company accounts.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <>
      <Header />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-udaan-navy mb-2">CSR Budget Planner</h1>
          <p className="text-gray-600">Allocate and manage your CSR budget effectively</p>
        </div>

      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Total Budget</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-udaan-orange" />
              <span className="text-3xl font-bold text-udaan-navy">₹{(totalBudget / 100000).toFixed(1)}L</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Allocated</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              <span className="text-3xl font-bold text-green-600">{totalAllocated}%</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Remaining</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <PieChart className="h-5 w-5 text-orange-600" />
              <span className="text-3xl font-bold text-orange-600">{remaining}%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Budget Allocation</CardTitle>
              <Button size="sm" onClick={addCategory} className="bg-udaan-orange hover:bg-udaan-orange/90">
                <Plus className="h-4 w-4 mr-1" />
                Add Category
              </Button>
            </div>
            <CardDescription>Adjust the budget distribution across categories</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label>Total CSR Budget (INR)</Label>
              <Input 
                type="number" 
                value={totalBudget}
                onChange={(e) => setTotalBudget(Number(e.target.value))}
                className="mt-1"
              />
            </div>

            {categories.map((category) => (
              <div key={category.id} className="space-y-2 p-4 border rounded-lg">
                <div className="flex items-center justify-between">
                  <Input 
                    value={category.name}
                    onChange={(e) => setCategories(categories.map(cat => 
                      cat.id === category.id ? { ...cat, name: e.target.value } : cat
                    ))}
                    className="max-w-[200px]"
                  />
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={() => removeCategory(category.id)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{category.percentage}%</span>
                  <span className="text-gray-600">₹{category.amount.toLocaleString()}</span>
                </div>
                <Slider
                  value={[category.percentage]}
                  onValueChange={(value) => updateCategory(category.id, value[0])}
                  max={100}
                  step={1}
                  className="w-full"
                  style={{ 
                    '--slider-color': category.color 
                  } as React.CSSProperties}
                />
              </div>
            ))}

            {remaining !== 0 && (
              <div className={`p-3 rounded-lg ${remaining < 0 ? 'bg-red-50 text-red-700' : 'bg-orange-50 text-orange-700'}`}>
                <p className="text-sm font-medium">
                  {remaining < 0 
                    ? `Over-allocated by ${Math.abs(remaining)}%` 
                    : `${remaining}% remaining to allocate`}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Budget Visualization</CardTitle>
            <CardDescription>Overview of your CSR budget distribution</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {categories.map((category) => (
                <div key={category.id}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{category.name}</span>
                    <span className="text-sm text-gray-600">₹{category.amount.toLocaleString()}</span>
                  </div>
                  <Progress 
                    value={category.percentage} 
                    className="h-3"
                    style={{
                      '--progress-background': category.color
                    } as React.CSSProperties}
                  />
                  <p className="text-xs text-gray-500 mt-1">{category.percentage}% of total budget</p>
                </div>
              ))}
            </div>

            <div className="mt-8 p-4 bg-udaan-navy/5 rounded-lg">
              <h3 className="font-semibold mb-3">Recommended Distribution</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>• Education & Skill Development: 30-40%</li>
                <li>• Healthcare: 20-30%</li>
                <li>• Environmental Sustainability: 15-20%</li>
                <li>• Women & Child Welfare: 10-15%</li>
                <li>• Rural Development: 5-10%</li>
              </ul>
            </div>

            <Button className="w-full mt-6 bg-green-600 hover:bg-green-700">
              Save Budget Plan
            </Button>
          </CardContent>
        </Card>
      </div>
      </div>
    </>
  )
}
