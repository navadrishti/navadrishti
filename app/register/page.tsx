'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Building, Briefcase, User } from 'lucide-react';

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-r from-blue-50 to-indigo-50 p-4">
      <Card className="w-full max-w-md shadow-xl transition-all duration-300 hover:shadow-2xl">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center animate-fadeIn">Create an Account</CardTitle>
          <CardDescription className="text-center animate-fadeIn">
            Choose how you would like to join our platform
          </CardDescription>
        </CardHeader>
        
        <CardContent className="grid gap-4">
          <Link href="/individuals/register" passHref>
            <Button className="w-full justify-start h-16 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg active:scale-95" variant="outline">
              <User className="mr-2 h-5 w-5" />
              <div className="flex flex-col items-start">
                <span>Register as Individual</span>
                <span className="text-xs text-gray-500">For professionals seeking opportunities</span>
              </div>
            </Button>
          </Link>
          
          <Link href="/ngos/register" passHref>
            <Button className="w-full justify-start h-16 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg active:scale-95" variant="outline">
              <Building className="mr-2 h-5 w-5" />
              <div className="flex flex-col items-start">
                <span>Register as NGO</span>
                <span className="text-xs text-gray-500">For non-profit organizations</span>
              </div>
            </Button>
          </Link>
          
          <Link href="/companies/register" passHref>
            <Button className="w-full justify-start h-16 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg active:scale-95" variant="outline">
              <Briefcase className="mr-2 h-5 w-5" />
              <div className="flex flex-col items-start">
                <span>Register as Company</span>
                <span className="text-xs text-gray-500">For businesses looking to hire or support</span>
              </div>
            </Button>
          </Link>
        </CardContent>
        
        <CardFooter className="flex justify-center">
          <div className="text-center text-sm">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-primary hover:underline transition-all duration-200">
              Sign in
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}