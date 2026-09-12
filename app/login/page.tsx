import { LoginForm } from '@/components/login-form';

// Route segment config only takes effect from a Server Component, so the
// actual form lives in a client component: this file just opts the route
// out of static prerendering, which otherwise freezes it behind a
// long-lived cache header and can leave phones/native clients stuck on a
// stale build after a redeploy.
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return <LoginForm />;
}
