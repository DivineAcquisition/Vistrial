// @ts-nocheck
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
          <h1 className="text-2xl font-bold text-white">Memberships</h1>
          <p className="text-gray-400">Manage recurring service memberships</p>
        </div>
        <Link
          href="/memberships/new"
          className="flex items-center gap-2 bg-gradient-to-r from-brand-500 to-brand-600 text-white px-4 py-2.5 rounded-xl font-medium hover:from-brand-600 hover:to-brand-700 transition-all"
        >
          <RiAddLine className="w-5 h-5" />
          New Membership
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-green-500/20 to-green-600/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-green-400/20 to-green-600/20 rounded-xl flex items-center justify-center">
                <RiVipCrownLine className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Active</p>
                <p className="text-2xl font-bold text-white">{stats.active}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-500/20 to-amber-600/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-amber-400/20 to-amber-600/20 rounded-xl flex items-center justify-center">
                <RiPauseLine className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Paused</p>
                <p className="text-2xl font-bold text-white">{stats.paused}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-red-500/20 to-red-600/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-red-400/20 to-red-600/20 rounded-xl flex items-center justify-center">
                <RiAlertLine className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Past Due</p>
                <p className="text-2xl font-bold text-white">{stats.pastDue}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500/20 to-brand-600/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-brand-400/20 to-brand-600/20 rounded-xl flex items-center justify-center">
                <RiMoneyDollarCircleLine className="w-6 h-6 text-brand-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">MRR</p>
                <p className="text-2xl font-bold text-white">{formatCurrency(stats.mrr)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-gray-500/20 to-gray-600/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-gray-400/20 to-gray-600/20 rounded-xl flex items-center justify-center">
                <RiArrowRightLine className="w-6 h-6 text-gray-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Churned</p>
                <p className="text-2xl font-bold text-white">{stats.churnedThisMonth}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <select
          name="status"
          defaultValue={params.status || "all"}
          className="px-4 py-2.5 bg-gray-900/80 border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-500/50"
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
          className="px-4 py-2.5 bg-gray-900/80 border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-500/50"
        >
          <option value="all">All Frequencies</option>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Biweekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>

      {/* Memberships List */}
      <div className="relative">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500/10 via-brand-600/10 to-indigo-500/10 rounded-2xl blur opacity-50" />
        <div className="relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
          <div className="h-px bg-gradient-to-r from-transparent via-brand-500/50 to-transparent" />

          {memberships.length > 0 ? (
            <div className="divide-y divide-white/5">
              {memberships.map((membership) => (
                <Link
                  key={membership.id}
                  href={`/memberships/${membership.id}`}
                  className="block p-4 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-brand-500/20 to-brand-600/20 rounded-xl flex items-center justify-center">
                        <RiVipCrownLine className="w-6 h-6 text-brand-400" />
                      </div>
                      <div>
                        <p className="font-medium text-white">
                          {membership.contacts?.first_name} {membership.contacts?.last_name}
                        </p>
                        <p className="text-sm text-gray-400">
                          {membership.service_types?.name} · {membership.frequency}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-sm text-gray-400">Per Service</p>
                        <p className="font-semibold text-white">{formatCurrency(membership.price_per_service)}</p>
                      </div>
                      {membership.next_service_date && (
                        <div className="text-right">
                          <p className="text-sm text-gray-400">Next Service</p>
                          <p className="font-medium text-white flex items-center gap-1">
                            <RiCalendarLine className="w-3.5 h-3.5" />
                            {new Date(membership.next_service_date).toLocaleDateString()}
                          </p>
                        </div>
                      )}
                      <span
                        className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                          membership.status === "active"
                            ? "bg-green-500/20 text-green-400 border border-green-500/30"
                            : membership.status === "paused"
                            ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                            : membership.status === "past_due"
                            ? "bg-red-500/20 text-red-400 border border-red-500/30"
                            : "bg-white/10 text-gray-400 border border-white/10"
                        }`}
                      >
                        {membership.status}
                      </span>
                      <RiArrowRightLine className="w-5 h-5 text-gray-500" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/10">
                <RiVipCrownLine className="w-8 h-8 text-gray-500" />
              </div>
              <p className="text-gray-400 mb-4">No memberships found</p>
              <Link
                href="/memberships/new"
                className="inline-flex items-center gap-2 text-brand-400 hover:text-brand-300 font-medium transition-colors"
              >
                Create your first membership
                <RiArrowRightLine className="w-4 h-4" />
              </Link>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-white/10 flex items-center justify-between">
              <p className="text-sm text-gray-400">
                Showing {(page - 1) * 25 + 1} to {Math.min(page * 25, total)} of {total}
              </p>
              <div className="flex items-center gap-2">
                {page > 1 && (
                  <Link
                    href={`/memberships?page=${page - 1}${params.status ? `&status=${params.status}` : ""}${params.frequency ? `&frequency=${params.frequency}` : ""}`}
                    className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white hover:bg-white/10 transition-colors"
                  >
                    Previous
                  </Link>
                )}
                {page < totalPages && (
                  <Link
                    href={`/memberships?page=${page + 1}${params.status ? `&status=${params.status}` : ""}${params.frequency ? `&frequency=${params.frequency}` : ""}`}
                    className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white hover:bg-white/10 transition-colors"
                  >
                    Next
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
