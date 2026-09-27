import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { NgoPastProject } from '@/lib/auth'

type PastProjectsFieldProps = {
  projects: NgoPastProject[]
  onUpdate: (index: number, field: keyof NgoPastProject, value: string) => void
  onAdd: () => void
  onRemove: (index: number) => void
}

export function PastProjectsField({ projects, onUpdate, onAdd, onRemove }: PastProjectsFieldProps) {
  return (
    <div className="space-y-3 md:col-span-2">
      <div>
        <Label>Past Projects <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <p className="mt-1 text-xs text-muted-foreground">
          Add pre-platform project history here only once. After you join, new projects you run on GRAM are added automatically.
        </p>
      </div>

      {projects.map((project, index) => (
        <div key={`past-project-${index}`} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-slate-900">Project {index + 1}</p>
            {projects.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-red-600 hover:text-red-700"
                onClick={() => onRemove(index)}
              >
                Remove
              </Button>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor={`pastProjectTitle-${index}`}>Project title</Label>
            <Input
              id={`pastProjectTitle-${index}`}
              value={project.title}
              onChange={(e) => onUpdate(index, 'title', e.target.value)}
              placeholder="e.g. Rural health camp 2023"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`pastProjectDescription-${index}`}>
              Description / outcomes <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id={`pastProjectDescription-${index}`}
              value={project.description}
              onChange={(e) => onUpdate(index, 'description', e.target.value)}
              placeholder="Location, period, beneficiaries, and measurable outcomes"
              rows={2}
            />
          </div>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={onAdd}>
        Add another project
      </Button>
    </div>
  )
}
