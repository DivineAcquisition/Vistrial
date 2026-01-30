import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  RiCalendarLine,
  RiTeamLine,
  RiVipCrownLine,
  RiMoneyDollarCircleLine,
} from "@remixicon/react";

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get today's date range
  const today = new Date();
  const todayStart = new Date(today.setHours(0, 0, 0, 0)).toISOString();
  const todayEnd = new Date(today.setHours(23, 59, 59, 999)).toISOString();

  // Fetch stats (adjust based on your actual table structure)
  let stats = {
    todaysBookings: 0,
    totalCustomers: 0,
    activeMembers: 0,
    monthlyRevenue: 0,
  };

  try {
    // These queries depend on your actual database structure
    // Adjust table names and fields as needed
    
    // Today's bookings count
    const { count: bookingsCount } = await supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .gte("scheduled_date", todayStart)
      .lte("scheduled_date", todayEnd);
    
    if (bookingsCount) stats.todaysBookings = bookingsCount;
  } catch {
    // Table may not exist
  }

  try {
    // Total customers (leads or contacts)
    const { count: customersCount } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true });
    
    if (customersCount) stats.totalCustomers = customersCount;
  } catch {
    // Table may not exist
  }

  const statCards = [
    {
      title: "Today's Bookings",
      value: stats.todaysBookings.toString(),
      icon: RiCalendarLine,
      color: "bg-blue-500",
      bgColor: "bg-blue-50 dark:bg-blue-900/20",
    },
    {
      title: "Total Customers",
      value: stats.totalCustomers.toString(),
      icon: RiTeamLine,
      color: "bg-green-500",
      bgColor: "bg-green-50 dark:bg-green-900/20",
    },
    {
      title: "Active Members",
      value: stats.activeMembers.toString(),
      icon: RiVipCrownLine,
      color: "bg-purple-500",
      bgColor: "bg-purple-50 dark:bg-purple-900/20",
    },
    {
      title: "Monthly Revenue",
      value: `$${stats.monthlyRevenue.toLocaleString()}`,
      icon: RiMoneyDollarCircleLine,
      color: "bg-amber-500",
      bgColor: "bg-amber-50 dark:bg-amber-900/20",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50">
          Welcome back{user?.user_metadata?.full_name ? `, ${user.user_metadata.full_name.split(" ")[0]}` : ""}!
        </h2>
        <p className="text-gray-500 dark:text-gray-400">
          Here&apos;s what&apos;s happening with your business today.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <div
            key={stat.title}
            className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6"
          >
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-6 w-6 ${stat.color.replace("bg-", "text-")}`} />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{stat.title}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-50">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Today's Schedule */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-4">
          Today&apos;s Schedule
        </h3>
        
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <RiCalendarLine className="h-12 w-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <p>No bookings scheduled for today.</p>
          <p className="text-sm mt-1">Bookings will appear here once customers start booking.</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-4">
          Quick Actions
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <a
            href="/quotes/new"
            className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-brand-500 dark:hover:border-brand-500 transition-colors"
          >
            <div className="p-2 rounded-lg bg-brand-50 dark:bg-brand-900/20">
              <RiMoneyDollarCircleLine className="h-5 w-5 text-brand-600 dark:text-brand-400" />
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-gray-50">Create Quote</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Send a new quote</p>
            </div>
          </a>
          
          <a
            href="/customers"
            className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-brand-500 dark:hover:border-brand-500 transition-colors"
          >
            <div className="p-2 rounded-lg bg-green-50 dark:bg-green-900/20">
              <RiTeamLine className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-gray-50">View Customers</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Manage your customers</p>
            </div>
          </a>
          
          <a
            href="/settings/general"
            className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-brand-500 dark:hover:border-brand-500 transition-colors"
          >
            <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800">
              <RiCalendarLine className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-gray-50">Settings</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Configure your business</p>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}
