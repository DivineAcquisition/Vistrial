// @ts-nocheck
// ============================================
// WORKFLOW ANALYTICS
// Workflow performance table
// ============================================

import { getSupabaseServerClient } from '@/lib/supabase/server';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface WorkflowAnalyticsProps {
  organizationId: string;
  startDate: Date;
  endDate: Date;
}

export async function WorkflowAnalytics({
  organizationId,
  startDate,
  endDate,
}: WorkflowAnalyticsProps) {
  const supabase = await getSupabaseServerClient();

  // Get workflows with enrollment stats
  const { data: workflows } = await supabase
    .from('workflows')
    .select(`
      id,
      name,
      status,
      category,
      total_enrolled,
      total_completed,
      total_responses
    `)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('total_enrolled', { ascending: false, nullsFirst: false })
    .limit(10);

  // Get enrollment counts for this period
  const workflowStats: Record<string, { enrolled: number; completed: number; responded: number }> = {};

  if (workflows) {
    for (const workflow of workflows) {
      const { count: enrolled } = await supabase
        .from('workflow_enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('workflow_id', workflow.id)
        .gte('enrolled_at', startDate.toISOString())
        .lte('enrolled_at', endDate.toISOString());

      const { count: completed } = await supabase
        .from('workflow_enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('workflow_id', workflow.id)
        .eq('status', 'completed')
        .gte('enrolled_at', startDate.toISOString())
        .lte('enrolled_at', endDate.toISOString());

      const { count: responded } = await supabase
        .from('workflow_enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('workflow_id', workflow.id)
        .not('responded_at', 'is', null)
        .gte('enrolled_at', startDate.toISOString())
        .lte('enrolled_at', endDate.toISOString());

      workflowStats[workflow.id] = {
        enrolled: enrolled || 0,
        completed: completed || 0,
        responded: responded || 0,
      };
    }
  }

  const statusColors: Record<string, string> = {
    active: 'bg-green-500/20 text-green-400',
    paused: 'bg-yellow-500/20 text-yellow-400',
    draft: 'bg-gray-500/20 text-gray-400',
  };

  return (
    <Card className="bg-gray-900/80 border-white/10">
      <CardHeader>
        <CardTitle className="text-white">Workflow Performance</CardTitle>
        <CardDescription className="text-gray-400">
          Performance metrics for your workflows during this period
        </CardDescription>
      </CardHeader>
      <CardContent>
        {workflows && workflows.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-gray-400">Workflow</TableHead>
                  <TableHead className="text-gray-400">Status</TableHead>
                  <TableHead className="text-gray-400 text-right">Enrolled</TableHead>
                  <TableHead className="text-gray-400 text-right">Completed</TableHead>
                  <TableHead className="text-gray-400 text-right">Responses</TableHead>
                  <TableHead className="text-gray-400">Response Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workflows.map((workflow) => {
                  const stats = workflowStats[workflow.id] || { enrolled: 0, completed: 0, responded: 0 };
                  const responseRate = stats.enrolled > 0
                    ? (stats.responded / stats.enrolled) * 100
                    : 0;

                  return (
                    <TableRow key={workflow.id} className="border-white/10 hover:bg-gray-800/50">
                      <TableCell>
                        <Link
                          href={`/workflows/${workflow.id}`}
                          className="font-medium text-white hover:text-brand-400 transition-colors"
                        >
                          {workflow.name}
                        </Link>
                        <p className="text-xs text-gray-500">
                          {workflow.category?.replace('_', ' ') || 'General'}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={statusColors[workflow.status] || 'bg-gray-500/20 text-gray-400'}
                        >
                          {workflow.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-white">{stats.enrolled}</TableCell>
                      <TableCell className="text-right text-white">{stats.completed}</TableCell>
                      <TableCell className="text-right text-white">{stats.responded}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={responseRate} className="w-16 h-2 bg-gray-700" />
                          <span className="text-sm text-gray-400">
                            {responseRate.toFixed(1)}%
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="h-32 flex items-center justify-center text-gray-500">
            No workflows found. Create a workflow to start tracking performance.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
