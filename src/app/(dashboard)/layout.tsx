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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Sidebar */}
      <DashboardSidebar
        organization={{
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          logo_url: organization.logo_url || undefined,
        }}
        user={{
          email: user?.email || '',
          user_metadata: user?.user_metadata,
        }}
      />

      {/* Main content */}
      <div className="lg:pl-72">
        {/* Page content */}
        <main className="min-h-screen p-4 pt-16 md:p-6 lg:pt-6">{children}</main>
      </div>
    </div>
  );
}
