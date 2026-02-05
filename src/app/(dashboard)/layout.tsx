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
    <div className="min-h-screen bg-gray-950 relative">
      {/* Gradient background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-brand-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-brand-500/5 rounded-full blur-3xl" />
      </div>

      {/* Content wrapper */}
      <div className="relative z-10">
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
        <div className="lg:pl-64">
          {/* Page content */}
          <main className="p-4 md:p-6 pt-16 lg:pt-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
