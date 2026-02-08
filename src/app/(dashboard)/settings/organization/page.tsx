// Redirect to new business settings page
import { redirect } from 'next/navigation';

export default function OrganizationSettingsPage() {
  redirect('/settings/business');
}
