import { withAuth } from "next-auth/middleware";
import { NextRequest, NextResponse } from "next/server";

const authMiddleware = withAuth({
  pages: {
    signIn: '/login',
  },
});

export function proxy(req: NextRequest, event: any) {
  // 1. Intercept malformed / bot Next-Action header probes (e.g. "x", "0", "1", "action")
  // Legitimate Next.js Server Actions always have a 42-character SHA-1 hash.
  const nextAction = req.headers.get('next-action');
  if (nextAction && nextAction.length < 20) {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      (req as any).ip ||
      'onbekend';

    console.warn(
      `🚨 [BOT BLOCKED] IP: ${ip} probeerde ongeldige Next-Action: "${nextAction}" op ${req.nextUrl.pathname}`
    );
    return new NextResponse('Not Found', { status: 404 });
  }

  // 2. Allow login page without requiring active session
  if (req.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.next();
  }

  // 3. Protected routes passed to NextAuth
  return (authMiddleware as any)(req, event);
}

export default proxy;

export const config = {
  matcher: [
    /*
     * Match all request paths except for static assets:
     * - api/auth (NextAuth internal endpoints)
     * - _next/static (static build files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon)
     * - logo.png (public logo)
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico|logo.png).*)',
  ],
};
