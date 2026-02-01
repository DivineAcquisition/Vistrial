/**
 * SMS Timing Validation
 * 
 * TCPA requires messages to be sent only between 8am-9pm recipient's local time
 */

// Default timezone if none specified
const DEFAULT_TIMEZONE = "America/New_York"

// Allowed messaging hours (TCPA requirement)
const START_HOUR = 8 // 8:00 AM
const END_HOUR = 21 // 9:00 PM

/**
 * Check if current time is within allowed SMS hours (8am-9pm)
 */
export function canSendNow(timezone: string = DEFAULT_TIMEZONE): boolean {
  try {
    const now = new Date()
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    }

    const hour = parseInt(new Intl.DateTimeFormat("en-US", options).format(now))

    return hour >= START_HOUR && hour < END_HOUR
  } catch {
    // If timezone is invalid, fall back to default
    return canSendNow(DEFAULT_TIMEZONE)
  }
}

/**
 * Get the current hour in recipient's timezone
 */
export function getCurrentHour(timezone: string = DEFAULT_TIMEZONE): number {
  try {
    const now = new Date()
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    }

    return parseInt(new Intl.DateTimeFormat("en-US", options).format(now))
  } catch {
    return new Date().getHours()
  }
}

/**
 * Get next valid send time if outside allowed hours
 */
export function getNextValidSendTime(timezone: string = DEFAULT_TIMEZONE): Date {
  try {
    const now = new Date()

    // Get current hour in recipient's timezone
    const hour = getCurrentHour(timezone)

    // If within allowed hours, return now
    if (hour >= START_HOUR && hour < END_HOUR) {
      return now
    }

    // Calculate next 8 AM
    const next8AM = new Date(now)

    if (hour >= END_HOUR) {
      // After 9 PM - schedule for tomorrow 8 AM
      next8AM.setDate(next8AM.getDate() + 1)
    }

    // Set to 8 AM
    // Note: This is an approximation. For precise timezone handling,
    // you might want to use a library like date-fns-tz or luxon
    next8AM.setHours(START_HOUR, 0, 0, 0)

    return next8AM
  } catch {
    // Fallback: return now + 1 hour
    const fallback = new Date()
    fallback.setHours(fallback.getHours() + 1)
    return fallback
  }
}

/**
 * Check if it's a weekend in recipient's timezone
 */
export function isWeekend(timezone: string = DEFAULT_TIMEZONE): boolean {
  try {
    const now = new Date()
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      weekday: "short",
    }

    const day = new Intl.DateTimeFormat("en-US", options).format(now)
    return day === "Sat" || day === "Sun"
  } catch {
    const day = new Date().getDay()
    return day === 0 || day === 6
  }
}

/**
 * Get day of week (0 = Sunday, 6 = Saturday) in recipient's timezone
 */
export function getDayOfWeek(timezone: string = DEFAULT_TIMEZONE): number {
  try {
    const now = new Date()
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      weekday: "short",
    }

    const day = new Intl.DateTimeFormat("en-US", options).format(now)
    const dayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    }

    return dayMap[day] ?? new Date().getDay()
  } catch {
    return new Date().getDay()
  }
}

/**
 * Get next weekday (skipping weekend) at valid send time
 */
export function getNextWeekdaySendTime(
  timezone: string = DEFAULT_TIMEZONE
): Date {
  const nextTime = getNextValidSendTime(timezone)
  const day = getDayOfWeek(timezone)

  if (day === 6) {
    // Saturday - move to Monday
    nextTime.setDate(nextTime.getDate() + 2)
  } else if (day === 0) {
    // Sunday - move to Monday
    nextTime.setDate(nextTime.getDate() + 1)
  }

  return nextTime
}

/**
 * Format time for display in recipient's timezone
 */
export function formatTimeInTimezone(
  date: Date,
  timezone: string = DEFAULT_TIMEZONE
): string {
  try {
    return date.toLocaleString("en-US", {
      timeZone: timezone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
  } catch {
    return date.toLocaleString()
  }
}

/**
 * Calculate delay until message can be sent
 */
export function getDelayUntilCanSend(
  timezone: string = DEFAULT_TIMEZONE,
  skipWeekends: boolean = false
): number {
  const now = new Date()
  let nextValidTime: Date

  if (skipWeekends && isWeekend(timezone)) {
    nextValidTime = getNextWeekdaySendTime(timezone)
  } else {
    nextValidTime = getNextValidSendTime(timezone)
  }

  return Math.max(0, nextValidTime.getTime() - now.getTime())
}

/**
 * US timezone map for common abbreviations
 */
export const US_TIMEZONES: Record<string, string> = {
  EST: "America/New_York",
  EDT: "America/New_York",
  CST: "America/Chicago",
  CDT: "America/Chicago",
  MST: "America/Denver",
  MDT: "America/Denver",
  PST: "America/Los_Angeles",
  PDT: "America/Los_Angeles",
  AKST: "America/Anchorage",
  AKDT: "America/Anchorage",
  HST: "Pacific/Honolulu",
}

/**
 * Normalize timezone string to IANA format
 */
export function normalizeTimezone(timezone: string): string {
  // If it's already an IANA timezone, return it
  if (timezone.includes("/")) {
    return timezone
  }

  // Try to match common abbreviations
  const upper = timezone.toUpperCase()
  return US_TIMEZONES[upper] || DEFAULT_TIMEZONE
}
