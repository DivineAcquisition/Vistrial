/**
 * Credits Service
 * 
 * Business logic for credit management:
 * - Balance tracking
 * - Credit deduction
 * - Usage logging
 * - Balance checks
 */

import { createAdminClient } from "@/lib/supabase/admin";

interface CreditTransaction {
  type: string;
  [key: string]: any;
}

interface CreditBalance {
  total: number;
  used: number;
  remaining: number;
}

interface UsageBreakdown {
  sms: number;
  voice: number;
  ai: number;
}

class CreditsService {
  /**
   * Get credit balance for a business
   */
  async getBalance(businessId: string): Promise<CreditBalance> {
    const supabase = createAdminClient();

    const { data: business } = await supabase
      .from("businesses")
      .select("credit_balance, monthly_credits")
      .eq("id", businessId)
      .single();

    if (!business) {
      throw new Error("Business not found");
    }

    const total = business.monthly_credits || 0;
    const remaining = business.credit_balance || 0;
    const used = total - remaining;

    return { total, used, remaining };
  }

  /**
   * Get usage breakdown by type
   */
  async getUsageBreakdown(businessId: string, startDate?: Date): Promise<UsageBreakdown> {
    const supabase = createAdminClient();

    let query = supabase
      .from("credit_transactions")
      .select("type, amount")
      .eq("business_id", businessId)
      .lt("amount", 0); // Only deductions

    if (startDate) {
      query = query.gte("created_at", startDate.toISOString());
    }

    const { data } = await query;

    const breakdown: UsageBreakdown = { sms: 0, voice: 0, ai: 0 };

    if (data) {
      for (const tx of data) {
        const amount = Math.abs(tx.amount);
        if (tx.type === "sms") breakdown.sms += amount;
        else if (tx.type === "voice") breakdown.voice += amount;
        else if (tx.type === "ai") breakdown.ai += amount;
      }
    }

    return breakdown;
  }

  /**
   * Check if business has sufficient credits
   */
  async checkBalance(businessId: string, creditsNeeded: number): Promise<boolean> {
    const balance = await this.getBalance(businessId);
    return balance.remaining >= creditsNeeded;
  }

  /**
   * Add credits to a business
   */
  async addCredits(
    businessId: string,
    amount: number,
    metadata: CreditTransaction
  ): Promise<number> {
    const supabase = createAdminClient();

    // Update balance
    const { data: business } = await supabase
      .from("businesses")
      .select("credit_balance")
      .eq("id", businessId)
      .single();

    const currentBalance = business?.credit_balance || 0;
    const newBalance = currentBalance + amount;

    await supabase
      .from("businesses")
      .update({ 
        credit_balance: newBalance,
        updated_at: new Date().toISOString(),
      })
      .eq("id", businessId);

    // Log transaction
    await this.logTransaction(businessId, amount, "credit", metadata);

    return newBalance;
  }

  /**
   * Deduct credits from a business
   */
  async deductCredits(
    businessId: string,
    amount: number,
    metadata: CreditTransaction
  ): Promise<number> {
    const supabase = createAdminClient();

    // Check balance first
    const hasCredits = await this.checkBalance(businessId, amount);
    if (!hasCredits) {
      throw new Error("Insufficient credits");
    }

    // Update balance
    const { data: business } = await supabase
      .from("businesses")
      .select("credit_balance")
      .eq("id", businessId)
      .single();

    const currentBalance = business?.credit_balance || 0;
    const newBalance = Math.max(0, currentBalance - amount);

    await supabase
      .from("businesses")
      .update({ 
        credit_balance: newBalance,
        updated_at: new Date().toISOString(),
      })
      .eq("id", businessId);

    // Log transaction
    await this.logTransaction(businessId, -amount, "debit", metadata);

    return newBalance;
  }

  /**
   * Reserve credits (for pending operations like calls)
   */
  async reserveCredits(
    businessId: string,
    amount: number,
    metadata: CreditTransaction
  ): Promise<string> {
    const supabase = createAdminClient();

    // Check balance
    const hasCredits = await this.checkBalance(businessId, amount);
    if (!hasCredits) {
      throw new Error("Insufficient credits");
    }

    // Create reservation record
    const { data, error } = await supabase
      .from("credit_reservations")
      .insert({
        business_id: businessId,
        amount,
        status: "pending",
        metadata,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min expiry
      })
      .select()
      .single();

    if (error) throw error;
    return data.id;
  }

  /**
   * Finalize a credit reservation
   */
  async finalizeReservation(
    reservationId: string,
    actualAmount: number
  ): Promise<void> {
    const supabase = createAdminClient();

    const { data: reservation } = await supabase
      .from("credit_reservations")
      .select("*")
      .eq("id", reservationId)
      .single();

    if (!reservation || reservation.status !== "pending") {
      throw new Error("Reservation not found or already processed");
    }

    // Deduct actual amount
    await this.deductCredits(reservation.business_id, actualAmount, {
      ...reservation.metadata,
      reservationId,
    });

    // Mark reservation as completed
    await supabase
      .from("credit_reservations")
      .update({ status: "completed", actual_amount: actualAmount })
      .eq("id", reservationId);
  }

  /**
   * Cancel a credit reservation
   */
  async cancelReservation(reservationId: string): Promise<void> {
    const supabase = createAdminClient();

    await supabase
      .from("credit_reservations")
      .update({ status: "cancelled" })
      .eq("id", reservationId);
  }

  /**
   * Log a credit transaction
   */
  private async logTransaction(
    businessId: string,
    amount: number,
    direction: "credit" | "debit",
    metadata: CreditTransaction
  ): Promise<void> {
    const supabase = createAdminClient();

    await supabase.from("credit_transactions").insert({
      business_id: businessId,
      amount,
      direction,
      type: metadata.type,
      metadata,
      created_at: new Date().toISOString(),
    });
  }

  /**
   * Reset monthly credits (called by cron job)
   */
  async resetMonthlyCredits(businessId: string, planCredits: number): Promise<void> {
    const supabase = createAdminClient();

    await supabase
      .from("businesses")
      .update({
        credit_balance: planCredits,
        monthly_credits: planCredits,
        credits_reset_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", businessId);

    await this.logTransaction(businessId, planCredits, "credit", {
      type: "monthly_reset",
    });
  }
}

export const creditsService = new CreditsService();
