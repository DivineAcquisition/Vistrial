import { redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { DashboardSidebar } from '@/components/dashboard/sidebar';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await getAuthenticatedContext();

  if (!context) {
    redirect('/login');
  }

  const { user, organization } = context;

  // If no organization, redirect to onboarding
  if (!organization) {
    redirect('/onboarding');
  }

  // Safely access organization fields
  const org = organization as Record<string, any>;

  // If onboarding not completed, redirect to onboarding wizard
  if (org.onboarding_completed !== true) {
    redirect('/onboarding');
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Subtle ambient gradient */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 right-[20%] w-[600px] h-[600px] rounded-full bg-brand-400/[0.03] blur-3xl" />
        <div className="absolute bottom-0 left-[10%] w-[500px] h-[500px] rounded-full bg-brand-600/[0.02] blur-3xl" />
      </div>

      {/* Sidebar */}
      <DashboardSidebar
        organization={{
          id: org.id || '',
          name: org.name || 'My Business',
          slug: org.slug || 'my-business',
          logo_url: org.logo_url || undefined,
        }}
        user={{
          email: user?.email || '',
          user_metadata: user?.user_metadata,
        }}
      />

      {/* Main content */}
      <div className="relative lg:pl-[270px]">
        <main className="min-h-screen p-4 pt-16 md:p-8 lg:pt-8 max-w-[1400px]">
          {children}
        </main>
      </div>
    </div>
  );
}
