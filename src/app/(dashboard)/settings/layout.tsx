// ============================================
// SETTINGS LAYOUT WITH SIDEBAR NAVIGATION
// ============================================

import { SettingsSidebar } from '@/components/settings/settings-sidebar';

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] -m-4 md:-m-8 lg:-mt-8">
      <SettingsSidebar />
      <main className="flex-1 p-6 lg:p-8 max-w-4xl">
        {children}
      </main>
    </div>
  );
}
