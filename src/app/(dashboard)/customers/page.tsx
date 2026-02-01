import Link from "next/link";
import { requireBusiness } from "@/lib/auth/actions";
import { getCustomers, getCustomerStats, getCustomerTags } from "@/lib/data/customers";
import {
  RiUserLine,
  RiUserAddLine,
  RiSearchLine,
  RiVipCrownLine,
  RiArrowRightLine,
  RiPhoneLine,
  RiMailLine,
  RiAlertLine,
  RiMoneyDollarCircleLine,
} from "@remixicon/react";
import { formatCurrency } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

interface CustomersPageProps {
  searchParams: Promise<{
    status?: string;
    lifecycle?: string;
    search?: string;
    tags?: string;
    sort?: string;
    order?: string;
    page?: string;
  }>;
}

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const { business } = await requireBusiness();
  const params = await searchParams;

  const filters = {
    status: params.status,
    lifecycleStage: params.lifecycle,
    search: params.search,
    tags: params.tags?.split(",").filter(Boolean),
    sortBy: params.sort || "created_at",
    sortOrder: (params.order as "asc" | "desc") || "desc",
    page: params.page ? parseInt(params.page) : 1,
  };

  const [{ customers, total, page, totalPages }, stats, tags] = await Promise.all([
    getCustomers(business.id, filters),
    getCustomerStats(business.id),
    getCustomerTags(business.id),
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          <p className="text-gray-500">Manage your customer database</p>
        </div>
        <Link
          href="/customers/new"
          className="flex items-center gap-2 bg-gradient-to-r from-brand-500 to-brand-600 text-white px-4 py-2.5 rounded-xl font-medium hover:from-brand-600 hover:to-brand-700 transition-all shadow-lg shadow-brand-500/25"
        >
          <RiUserAddLine className="w-5 h-5" />
          Add Customer
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-brand-50 rounded-xl flex items-center justify-center">
              <RiUserLine className="w-6 h-6 text-brand-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center">
              <RiUserAddLine className="w-6 h-6 text-amber-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Leads</p>
              <p className="text-2xl font-bold text-gray-900">{stats.leads}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center">
              <RiVipCrownLine className="w-6 h-6 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Members</p>
              <p className="text-2xl font-bold text-gray-900">{stats.members}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center">
              <RiAlertLine className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">At Risk</p>
              <p className="text-2xl font-bold text-gray-900">{stats.atRisk}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
              <RiMoneyDollarCircleLine className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Avg LTV</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats.averageLTV)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <form className="flex-1 min-w-[200px] relative">
          <RiSearchLine className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            name="search"
            defaultValue={params.search}
            placeholder="Search customers..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </form>

        <select
          name="status"
          defaultValue={params.status || "all"}
          className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        >
          <option value="all">All Status</option>
          <option value="lead">Leads</option>
          <option value="customer">Customers</option>
          <option value="member">Members</option>
          <option value="inactive">Inactive</option>
        </select>

        <select
          name="lifecycle"
          defaultValue={params.lifecycle || "all"}
          className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        >
          <option value="all">All Lifecycle</option>
          <option value="new">New</option>
          <option value="engaged">Engaged</option>
          <option value="converted">Converted</option>
          <option value="loyal">Loyal</option>
          <option value="at_risk">At Risk</option>
        </select>

        {tags.length > 0 && (
          <select
            name="tags"
            defaultValue=""
            className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="">All Tags</option>
            {tags.map((tag: any) => (
              <option key={tag.id} value={tag.id}>{tag.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Customer List */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="h-px bg-gradient-to-r from-transparent via-brand-500 to-transparent" />

        {customers.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {customers.map((customer) => (
              <Link
                key={customer.id}
                href={`/customers/${customer.id}`}
                className="block p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-brand-100 to-brand-200 rounded-xl flex items-center justify-center">
                      <span className="text-lg font-semibold text-brand-600">
                        {customer.first_name?.[0]}{customer.last_name?.[0]}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {customer.first_name} {customer.last_name}
                      </p>
                      <div className="flex items-center gap-3 text-sm text-gray-500">
                        {customer.phone && (
                          <span className="flex items-center gap-1">
                            <RiPhoneLine className="w-3.5 h-3.5" />
                            {customer.phone}
                          </span>
                        )}
                        {customer.email && (
                          <span className="flex items-center gap-1">
                            <RiMailLine className="w-3.5 h-3.5" />
                            {customer.email}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-sm text-gray-400">Bookings</p>
                      <p className="font-semibold text-gray-900">{customer.total_bookings || 0}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-400">Total Spent</p>
                      <p className="font-semibold text-gray-900">{formatCurrency(customer.total_spent || 0)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {customer.tags?.slice(0, 2).map((tag: any) => (
                        <span
                          key={tag.id}
                          className="px-2 py-0.5 text-xs font-medium rounded-full border"
                          style={{
                            backgroundColor: `${tag.color}15`,
                            color: tag.color,
                            borderColor: `${tag.color}40`,
                          }}
                        >
                          {tag.name}
                        </span>
                      ))}
                      {customer.memberships?.some((m: any) => m.status === "active") && (
                        <span className="px-2.5 py-1 bg-green-50 text-green-700 text-xs font-medium rounded-full border border-green-200">
                          Member
                        </span>
                      )}
                    </div>
                    <RiArrowRightLine className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-gray-200">
              <RiUserLine className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-500 mb-4">No customers found</p>
            <Link
              href="/customers/new"
              className="inline-flex items-center gap-2 text-brand-600 hover:text-brand-700 font-medium transition-colors"
            >
              Add your first customer
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
                  href={`/customers?page=${page - 1}${params.status ? `&status=${params.status}` : ""}${params.search ? `&search=${params.search}` : ""}`}
                  className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  Previous
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={`/customers?page=${page + 1}${params.status ? `&status=${params.status}` : ""}${params.search ? `&search=${params.search}` : ""}`}
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
