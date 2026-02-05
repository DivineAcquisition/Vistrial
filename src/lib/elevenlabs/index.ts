// ============================================
// ELEVENLABS EXPORTS
// ============================================

export {
  getElevenLabsClient,
  AVAILABLE_VOICES,
  getDefaultVoiceId,
  getVoiceConfig,
  getVoicesForCategory,
  DEFAULT_VOICE_SETTINGS,
  VOICEMAIL_VOICE_SETTINGS,
  generateSpeech,
  textToSpeech,
  uploadAudioToStorage,
  deleteAudioFromStorage,
  deliverVoiceDrop,
  calculateVoiceDropCost,
  estimateVoiceDropDuration,
  getVoices,
  getVoice,
  getSubscription,
} from './client';

export type {
  VoiceConfig,
  VoiceSettings,
  GenerateSpeechParams,
  GenerateSpeechResult,
  VoiceDropDeliveryParams,
  VoiceDropDeliveryResult,
} from './client';
