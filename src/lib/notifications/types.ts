import type { Enums } from "@/types/database";

export type NotificationEventType = Enums<"notification_event_type">;
export type NotificationChannel = Enums<"notification_channel">;
export type NotificationStatus = Enums<"notification_status">;

export type LeadName = { firstName: string | null };

export type EnqueueInput = {
  orgId: string | null;
  eventType: NotificationEventType;
  channel: NotificationChannel;
  recipientUserId: string | null;
  recipientMemberId: string | null;
  actorUserId?: string | null;
  subjectKind?: string | null;
  subjectIds: string[];
  title: string;
  body: string;
  href: string;
  dedupeKey: string;
  batchKey?: string | null;
  escalationStep?: number;
  isEmergency?: boolean;
  isTest?: boolean;
  sendAfter?: Date;
};

export type WorkingHours = {
  timeZone: string;
  startHm: string;
  endHm: string;
  days: number[];
};

export type MemberNotifyTarget = {
  memberId: string;
  userId: string;
  role: Enums<"org_role">;
  email: string;
  phone: string | null;
  hours: WorkingHours;
};
