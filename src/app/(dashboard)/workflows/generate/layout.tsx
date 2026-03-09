import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Workflow Generator',
  description: 'Generate automated workflows with AI based on your business profile',
};

export default function GenerateWorkflowLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
