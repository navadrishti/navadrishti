import { NextResponse } from 'next/server';

function clearAuthCookies(response: NextResponse) {
  // Clear with the same attribute variants login may have used.
  // Local leftovers can be Secure=false while a prior tunnel/prod test used Secure=true.
  const variants = [
    { secure: false },
    { secure: true },
  ] as const;

  for (const { secure } of variants) {
    response.cookies.set('token', '', {
      path: '/',
      expires: new Date(0),
      maxAge: 0,
      httpOnly: true,
      secure,
      sameSite: 'strict',
    });

    response.cookies.set('user', '', {
      path: '/',
      expires: new Date(0),
      maxAge: 0,
      httpOnly: false,
      secure,
      sameSite: 'strict',
    });
  }

  response.cookies.delete('token');
  response.cookies.delete('user');
}

export async function POST() {
  try {
    const response = NextResponse.json({
      message: 'Logged out successfully',
      success: true,
    });

    clearAuthCookies(response);

    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({ error: 'Logout failed' }, { status: 500 });
  }
}
