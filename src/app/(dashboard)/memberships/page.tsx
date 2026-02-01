import Link from "next/link";
import { requireBusiness } from "@/lib/auth/actions";
import { getMemberships, getMembershipStats } from "@/lib/data/memberships";
import {
  RiVipCrownLine,
  RiAddLine,
  RiArrowRightLine,
  RiPauseLine,
  RiAlertLine,
  RiMoneyDollarCircleLine,
  RiCalendarLine,
} from "@remixicon/react";
import { formatCurrency } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

interface MembershipsPageProps {
  searchParams: Promise<{
    status?: string;
    frequency?: string;
    page?: string;
  }>;
}

export default async function MembershipsPage({ searchParams }: MembershipsPageProps) {
  const { business } = await requireBusiness();
  const params = await searchParams;

  const filters = {
    status: params.status,
    frequency: params.frequency,
    page: params.page ? parseInt(params.page) : 1,
  };

  const [{ memberships, total, page, totalPages }, stats] = await Promise.all([
    getMemberships(business.id, filters),
    getMembershipStats(business.id),
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Memberships</h1>
          <p className="text-gray-500">Manage recurring service memberships</p>
        </div>
        <Link
          href="/memberships/new"
          className="flex items-center gap-2 bg-gradient-to-r from-brand-500 to-brand-600 text-white px-4 py-2.5 rounded-xl font-medium hover:from-brand-600 hover:to-brand-700 transition-all shadow-lg shadow-brand-500/25"
        >
          <RiAddLine className="w-5 h-5" />
          New Membership
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center">
              <RiVipCrownLine className="w-6 h-6 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Active</p>
              <p className="text-2xl font-bold text-gray-900">{stats.active}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center">
              <RiPauseLine className="w-6 h-6 text-amber-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Paused</p>
              <p className="text-2xl font-bold text-gray-900">{stats.paused}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center">
              <RiAlertLine className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Past Due</p>
              <p className="text-2xl font-bold text-gray-900">{stats.pastDue}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-brand-50 rounded-xl flex items-center justify-center">
              <RiMoneyDollarCircleLine className="w-6 h-6 text-brand-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">MRR</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats.mrr)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
              <RiArrowRightLine className="w-6 h-6 text-gray-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Churned</p>
              <p className="text-2xl font-bold text-gray-900">{stats.churnedThisMonth}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <select
          name="status"
          defaultValue={params.status || "all"}
          className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="past_due">Past Due</option>
          <option value="canceled">Canceled</option>
        </select>

        <select
          name="frequency"
          defaultValue={params.frequency || "all"}
          className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        >
          <option value="all">All Frequencies</option>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Biweekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>

      {/* Memberships List */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="h-px bg-gradient-to-r from-transparent via-brand-500 to-transparent" />

        {memberships.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {memberships.map((membership) => (
              <Link
                key={membership.id}
                href={`/memberships/${membership.id}`}
                className="block p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-brand-100 to-brand-200 rounded-xl flex items-center justify-center">
                      <RiVipCrownLine className="w-6 h-6 text-brand-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {membership.contacts?.first_name} {membership.contacts?.last_name}
                      </p>
                      <p className="text-sm text-gray-500">
                        {membership.service_types?.name} · {membership.frequency}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-sm text-gray-400">Per Service</p>
                      <p className="font-semibold text-gray-900">{formatCurrency(membership.price_per_service)}</p>
                    </div>
                    {membership.next_service_date && (
                      <div className="text-right">
                        <p className="text-sm text-gray-400">Next Service</p>
                        <p className="font-medium text-gray-900 flex items-center gap-1">
                          <RiCalendarLine className="w-3.5 h-3.5" />
                          {new Date(membership.next_service_date).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                    <span
                      className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                        membership.status === "active"
                          ? "bg-green-50 text-green-700 border border-green-200"
                          : membership.status === "paused"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : membership.status === "past_due"
                          ? "bg-red-50 text-red-700 border border-red-200"
                          : "bg-gray-50 text-gray-600 border border-gray-200"
                      }`}
                    >
                      {membership.status}
                    </span>
                    <RiArrowRightLine className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-gray-200">
              <RiVipCrownLine className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-500 mb-4">No memberships found</p>
            <Link
              href="/memberships/new"
              className="inline-flex items-center gap-2 text-brand-600 hover:text-brand-700 font-medium transition-colors"
            >
              Create your first membership
              <RiArrowRightLine className="w-4 h-4" />
            </Link>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-100 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Showing {(page - 1) * 25 + 1} to {Math.min(page * 25, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              {page > 1 && (
                <Link
                  href={`/memberships?page=${page - 1}${params.status ? `&status=${params.status}` : ""}${params.frequency ? `&frequency=${params.frequency}` : ""}`}
                  className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  Previous
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={`/memberships?page=${page + 1}${params.status ? `&status=${params.status}` : ""}${params.frequency ? `&frequency=${params.frequency}` : ""}`}
                  className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  Next
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
