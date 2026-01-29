/**
 * Onboarding Module
 * Niche-aware flow for home service contractors
 */

// Types
export {
  TRADES,
  QUOTE_VOLUMES,
  FOLLOWUP_OPTIONS,
  ONBOARDING_STEPS,
  initialOnboardingData,
  type TradeId,
  type QuoteVolume,
  type FollowUpOption,
  type OnboardingData,
  type OnboardingStep,
} from "./types"

// Trade configurations
export {
  TRADE_CONFIGS,
  getTradeConfig,
  getTradeEmpathy,
  getTradeJobTypes,
  type TradeConfig,
} from "./trade-config"
