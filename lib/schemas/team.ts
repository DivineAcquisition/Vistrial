import { z } from "zod";

import { MIN_PASSWORD_LENGTH } from "@/lib/team/password";

export const teamRoleSchema = z.enum(["owner", "admin", "member"]);

export const inviteTeamSchema = z.object({
  email: z.string().trim().email("Enter a valid email."),
  role: teamRoleSchema,
});

export const resendInviteSchema = z.object({
  id: z.uuid(),
});

export const cancelInviteSchema = z.object({
  id: z.uuid(),
});

export const onboardingPasswordSchema = z
  .object({
    token: z.string().min(1).optional(),
    password: z.string().min(MIN_PASSWORD_LENGTH),
    confirm: z.string().min(1),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords do not match.",
    path: ["confirm"],
  });

export const onboardingProfileSchema = z.object({
  token: z.string().min(1).optional(),
  full_name: z.string().trim().min(1, "Full name is required."),
  job_title: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  timezone: z.string().trim().min(1, "Time zone is required."),
});

export const onboardingMfaConfirmSchema = z.object({
  token: z.string().min(1).optional(),
  factor_id: z.string().min(1),
  code: z.string().trim().min(6).max(12),
  recovery_saved: z
    .boolean()
    .refine((v) => v === true, "Confirm you have saved the recovery codes."),
});

export const onboardingMfaSkipSchema = z.object({
  token: z.string().min(1).optional(),
});

export const changeRoleSchema = z.object({
  id: z.uuid(),
  role: teamRoleSchema,
});

export const teamUserIdSchema = z.object({ id: z.uuid() });

export const updateOwnProfileSchema = z.object({
  full_name: z.string().trim().min(1, "Full name is required."),
  job_title: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  timezone: z.string().trim().min(1),
});

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1),
    password: z.string().min(MIN_PASSWORD_LENGTH),
    confirm: z.string().min(1),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords do not match.",
    path: ["confirm"],
  });

export const requestResetSchema = z.object({
  email: z.string().trim().email(),
});

export const completeResetSchema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(MIN_PASSWORD_LENGTH),
    confirm: z.string().min(1),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords do not match.",
    path: ["confirm"],
  });

export const activityFilterSchema = z.object({
  user_id: z.uuid().optional(),
  action: z.string().optional(),
});
