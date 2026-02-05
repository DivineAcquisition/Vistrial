// @ts-nocheck
// ============================================
// BILLING HISTORY CARD
// ============================================

import { format } from 'date-fns';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCentsToDollars } from '@/lib/stripe/prices';
import type { Transaction } from '@/types/database';

interface BillingHistoryCardProps {
  transactions: Transaction[];
}

const typeLabels: Record<string, string> = {
  subscription_payment: 'Subscription',
  credit_purchase: 'Credit Purchase',
  credit_refill: 'Auto-Refill',
  credit_adjustment: 'Adjustment',
  refund: 'Refund',
};

const statusColors: Record<string, string> = {
  completed: 'bg-green-500/20 text-green-400',
  pending: 'bg-yellow-500/20 text-yellow-400',
  failed: 'bg-red-500/20 text-red-400',
};

export function BillingHistoryCard({ transactions }: BillingHistoryCardProps) {
  return (
    <Card className="bg-gray-900/80 border-white/10">
      <CardHeader>
        <CardTitle className="text-white">Billing History</CardTitle>
        <CardDescription className="text-gray-400">
          Recent transactions and payments
        </CardDescription>
      </CardHeader>
      <CardContent>
        {transactions.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-gray-400">Date</TableHead>
                <TableHead className="text-gray-400">Type</TableHead>
                <TableHead className="text-gray-400">Description</TableHead>
                <TableHead className="text-gray-400">Status</TableHead>
                <TableHead className="text-right text-gray-400">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((transaction) => (
                <TableRow key={transaction.id} className="border-white/10 hover:bg-white/5">
                  <TableCell className="text-gray-300">
                    {format(new Date(transaction.created_at), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className="text-gray-300">
                    {typeLabels[transaction.type] || transaction.type}
                  </TableCell>
                  <TableCell className="text-gray-500">
                    {transaction.description || '-'}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={statusColors[transaction.status] || 'bg-gray-500/20 text-gray-400'}
                    >
                      {transaction.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium text-white">
                    {formatCentsToDollars(transaction.amount_cents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-gray-500">
            No transactions yet
          </div>
        )}
      </CardContent>
    </Card>
  );
}
