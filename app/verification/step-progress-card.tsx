import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { Step, VerificationCategory } from './types';

interface StepProgressCardProps {
  currentStep: Step;
  category: VerificationCategory;
}

export function StepProgressCard({ currentStep, category }: StepProgressCardProps) {
  const progressValue = currentStep === 1 ? 50 : 100;

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Step {currentStep} of 2
              </p>
              <p className="mt-1 text-sm font-medium text-slate-800">
                {currentStep === 1 ? 'Add your details' : 'Upload documents'}
              </p>
            </div>
            <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-udaan-orange">
              {progressValue}%
            </span>
          </div>

          <Progress
            value={progressValue}
            className="h-2.5 overflow-hidden rounded-full bg-slate-100 shadow-inner [&>div]:rounded-full [&>div]:bg-gradient-to-r [&>div]:from-udaan-orange [&>div]:to-orange-400 [&>div]:transition-transform [&>div]:duration-500 [&>div]:ease-out"
          />

          <div className="flex flex-col gap-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <p className="capitalize">
              Verification type: <span className="font-medium text-slate-700">{category}</span>
            </p>
            <div className="flex items-center gap-2">
              <span className={currentStep >= 1 ? 'font-medium text-udaan-orange' : ''}>Details</span>
              <span className="h-1 w-1 rounded-full bg-slate-300" aria-hidden="true" />
              <span className={currentStep >= 2 ? 'font-medium text-udaan-orange' : ''}>Documents</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
