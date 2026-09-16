import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

// Protect all routes by default, except sign-in
const isPublicRoute = createRouteMatcher(['/sign-in(.*)'])

export default clerkMiddleware((auth, request) => {
  if (!isPublicRoute(request)) {
    // Basic protection
    auth().protect()
    
    // Admin role check
    const { sessionClaims } = auth()
    if (sessionClaims?.metadata?.role !== 'admin') {
      // Return 403 or redirect to some unauthorized page
      // Normally you would redirect to a specific URL, e.g., the user dashboard, 
      // but returning a redirect Response works.
      const url = new URL('http://localhost:3000/sign-in', request.url)
      return Response.redirect(url)
    }
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
