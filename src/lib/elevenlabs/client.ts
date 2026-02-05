// ============================================
// ELEVENLABS CLIENT
// Text-to-speech voice generation
// ============================================

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

// ============================================
// CONFIGURATION
// ============================================

interface ElevenLabsConfig {
  apiKey: string;
  defaultVoiceId: string;
}

function getConfig(): ElevenLabsConfig | null {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.warn('ELEVENLABS_API_KEY is not set - Voice features will be disabled');
    return null;
  }

  return {
    apiKey,
    defaultVoiceId: process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM', // Rachel (default)
  };
}

/**
 * Get ElevenLabs client configuration
 */
export function getElevenLabsClient(): ElevenLabsConfig {
  const config = getConfig();
  if (!config) {
    throw new Error('ElevenLabs is not configured');
  }
  return config;
}

async function elevenlabsRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const config = getConfig();
  if (!config) throw new Error('ElevenLabs is not configured');

  const response = await fetch(`${ELEVENLABS_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'xi-api-key': config.apiKey,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail?.message || `ElevenLabs API error: ${response.status}`);
  }

  return response;
}

// ============================================
// VOICE CONFIGURATION
// ============================================

export interface VoiceConfig {
  id: string;
  name: string;
  description: string;
  previewUrl?: string;
  gender: 'male' | 'female';
  accent: string;
  useCase: string[];
}

// Pre-configured voices for home services
export const AVAILABLE_VOICES: VoiceConfig[] = [
  {
    id: process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM', // Rachel
    name: 'Rachel',
    description: 'Warm, professional female voice',
    gender: 'female',
    accent: 'American',
    useCase: ['reactivation', 'retention', 'review_request'],
  },
  {
    id: 'AZnzlk1XvdvUeBnXmlld', // Domi
    name: 'Domi',
    description: 'Friendly, energetic female voice',
    gender: 'female',
    accent: 'American',
    useCase: ['seasonal', 'referral'],
  },
  {
    id: 'EXAVITQu4vr4xnSDxMaL', // Bella
    name: 'Bella',
    description: 'Soft, warm female voice',
    gender: 'female',
    accent: 'American',
    useCase: ['win_back', 'retention'],
  },
  {
    id: 'ErXwobaYiN019PkySvjV', // Antoni
    name: 'Antoni',
    description: 'Professional male voice',
    gender: 'male',
    accent: 'American',
    useCase: ['reactivation', 'retention', 'review_request'],
  },
  {
    id: 'VR6AewLTigWG4xSOukaG', // Arnold
    name: 'Arnold',
    description: 'Authoritative male voice',
    gender: 'male',
    accent: 'American',
    useCase: ['seasonal', 'win_back'],
  },
  {
    id: 'pNInz6obpgDQGcFmaJgB', // Adam
    name: 'Adam',
    description: 'Deep, warm male voice',
    gender: 'male',
    accent: 'American',
    useCase: ['reactivation', 'referral'],
  },
];

/**
 * Get default voice ID
 */
export function getDefaultVoiceId(): string {
  return process.env.ELEVENLABS_VOICE_ID || AVAILABLE_VOICES[0].id;
}

/**
 * Get voice config by ID
 */
export function getVoiceConfig(voiceId: string): VoiceConfig | undefined {
  return AVAILABLE_VOICES.find((v) => v.id === voiceId);
}

/**
 * Get recommended voices for a workflow category
 */
export function getVoicesForCategory(category: string): VoiceConfig[] {
  return AVAILABLE_VOICES.filter((v) => v.useCase.includes(category));
}

// ============================================
// VOICE SETTINGS
// ============================================

export interface VoiceSettings {
  stability: number; // 0-1, higher = more consistent
  similarityBoost: number; // 0-1, higher = closer to original voice
  style: number; // 0-1, amount of style exaggeration
  useSpeakerBoost: boolean;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  stability: 0.5,
  similarityBoost: 0.75,
  style: 0.0,
  useSpeakerBoost: true,
};

// Voice settings optimized for voicemail
export const VOICEMAIL_VOICE_SETTINGS: VoiceSettings = {
  stability: 0.65, // More consistent for professional feel
  similarityBoost: 0.80,
  style: 0.15, // Slight expressiveness
  useSpeakerBoost: true,
};

// ============================================
// TEXT-TO-SPEECH GENERATION
// ============================================

export interface GenerateSpeechParams {
  text: string;
  voiceId?: string;
  settings?: Partial<VoiceSettings>;
  modelId?: string;
  outputFormat?: 'mp3_44100_128' | 'mp3_44100_64' | 'pcm_16000' | 'pcm_22050';
}

export interface GenerateSpeechResult {
  success: boolean;
  audioBuffer?: Buffer;
  audioUrl?: string;
  durationSeconds?: number;
  characterCount: number;
  estimatedCostCents: number;
  error?: string;
}

/**
 * Generate speech from text using ElevenLabs
 */
export async function generateSpeech(
  params: GenerateSpeechParams
): Promise<GenerateSpeechResult> {
  const config = getConfig();
  if (!config) {
    return {
      success: false,
      characterCount: params.text.length,
      estimatedCostCents: 0,
      error: 'ElevenLabs is not configured',
    };
  }

  const voiceId = params.voiceId || config.defaultVoiceId;
  const settings = { ...VOICEMAIL_VOICE_SETTINGS, ...params.settings };
  const characterCount = params.text.length;

  // Estimate cost: ElevenLabs charges ~$0.30 per 1000 characters
  const estimatedCostCents = Math.ceil((characterCount / 1000) * 30);

  try {
    // Generate audio using fetch API
    const response = await elevenlabsRequest(`/text-to-speech/${voiceId}`, {
      method: 'POST',
      body: JSON.stringify({
        text: params.text,
        model_id: params.modelId || 'eleven_monolingual_v1',
        voice_settings: {
          stability: settings.stability,
          similarity_boost: settings.similarityBoost,
          style: settings.style,
          use_speaker_boost: settings.useSpeakerBoost,
        },
      }),
      headers: {
        Accept: 'audio/mpeg',
      },
    });

    // Get audio as buffer
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    // Estimate duration (rough calculation for MP3)
    // MP3 at 128kbps = 16KB per second
    const estimatedDuration = Math.ceil(audioBuffer.length / 16000);

    return {
      success: true,
      audioBuffer,
      characterCount,
      durationSeconds: estimatedDuration,
      estimatedCostCents,
    };
  } catch (error) {
    console.error('ElevenLabs speech generation error:', error);

    return {
      success: false,
      characterCount,
      estimatedCostCents: 0,
      error: error instanceof Error ? error.message : 'Failed to generate speech',
    };
  }
}

/**
 * Legacy textToSpeech function for backward compatibility
 */
export async function textToSpeech({
  text,
  voiceId,
  modelId = 'eleven_monolingual_v1',
  voiceSettings,
}: {
  text: string;
  voiceId?: string;
  modelId?: string;
  voiceSettings?: Partial<VoiceSettings>;
}): Promise<ArrayBuffer> {
  const result = await generateSpeech({
    text,
    voiceId,
    modelId,
    settings: voiceSettings,
  });

  if (!result.success || !result.audioBuffer) {
    throw new Error(result.error || 'Failed to generate speech');
  }

  // Convert Node.js Buffer to ArrayBuffer
  const arrayBuffer = new ArrayBuffer(result.audioBuffer.length);
  const view = new Uint8Array(arrayBuffer);
  for (let i = 0; i < result.audioBuffer.length; i++) {
    view[i] = result.audioBuffer[i];
  }
  return arrayBuffer;
}

// ============================================
// AUDIO FILE MANAGEMENT
// ============================================

/**
 * Upload audio to storage and get public URL
 */
export async function uploadAudioToStorage(
  audioBuffer: Buffer,
  fileName: string,
  organizationId: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const { getSupabaseAdminClient } = await import('@/lib/supabase/admin');
    const admin = getSupabaseAdminClient();

    const filePath = `voice-drops/${organizationId}/${fileName}`;

    const { error } = await admin.storage
      .from('audio')
      .upload(filePath, audioBuffer, {
        contentType: 'audio/mpeg',
        upsert: true,
      });

    if (error) {
      throw error;
    }

    // Get public URL
    const { data: urlData } = admin.storage.from('audio').getPublicUrl(filePath);

    return {
      success: true,
      url: urlData.publicUrl,
    };
  } catch (error) {
    console.error('Audio upload error:', error);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload audio',
    };
  }
}

/**
 * Delete audio file from storage
 */
export async function deleteAudioFromStorage(
  filePath: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { getSupabaseAdminClient } = await import('@/lib/supabase/admin');
    const admin = getSupabaseAdminClient();

    const { error } = await admin.storage.from('audio').remove([filePath]);

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('Audio delete error:', error);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete audio',
    };
  }
}

// ============================================
// VOICE DROP DELIVERY
// ============================================

export interface VoiceDropDeliveryParams {
  to: string;
  audioUrl: string;
  callerId?: string;
  webhookUrl?: string;
  metadata?: Record<string, string>;
}

export interface VoiceDropDeliveryResult {
  success: boolean;
  dropId?: string;
  error?: string;
}

/**
 * Deliver voice drop via ringless voicemail
 */
export async function deliverVoiceDrop(
  params: VoiceDropDeliveryParams
): Promise<VoiceDropDeliveryResult> {
  const provider = process.env.VOICE_DROP_PROVIDER || 'simulate';

  try {
    switch (provider) {
      case 'slybroadcast':
        return await deliverViaSlybroadcast(params);
      case 'dropcowboy':
        return await deliverViaDropCowboy(params);
      default:
        // Simulate success for testing/development
        console.log('Voice drop delivery (simulated):', params);
        return {
          success: true,
          dropId: `sim_${Date.now()}`,
        };
    }
  } catch (error) {
    console.error('Voice drop delivery error:', error);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Delivery failed',
    };
  }
}

/**
 * Deliver via Slybroadcast
 */
async function deliverViaSlybroadcast(
  params: VoiceDropDeliveryParams
): Promise<VoiceDropDeliveryResult> {
  const apiUrl = 'https://www.slybroadcast.com/gateway/vmb.php';

  const formData = new URLSearchParams({
    c_uid: process.env.SLYBROADCAST_UID || '',
    c_password: process.env.SLYBROADCAST_PASSWORD || '',
    c_phone: params.to.replace(/\D/g, ''),
    c_url: params.audioUrl,
    c_callerID: params.callerId || process.env.SLYBROADCAST_CALLER_ID || '',
    c_date: 'now',
  });

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  });

  const result = await response.text();

  if (result.includes('OK')) {
    const sessionMatch = result.match(/session_id=(\d+)/);
    return {
      success: true,
      dropId: sessionMatch ? sessionMatch[1] : `sly_${Date.now()}`,
    };
  }

  return {
    success: false,
    error: result,
  };
}

/**
 * Deliver via Drop Cowboy
 */
async function deliverViaDropCowboy(
  params: VoiceDropDeliveryParams
): Promise<VoiceDropDeliveryResult> {
  const apiUrl = 'https://api.dropcowboy.com/v1/ringless';

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.DROPCOWBOY_API_KEY}`,
    },
    body: JSON.stringify({
      phone_number: params.to,
      audio_url: params.audioUrl,
      caller_id: params.callerId || process.env.DROPCOWBOY_CALLER_ID,
      webhook_url: params.webhookUrl,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    return {
      success: false,
      error,
    };
  }

  const result = await response.json();

  return {
    success: true,
    dropId: result.id || result.drop_id,
  };
}

// ============================================
// COST CALCULATION
// ============================================

/**
 * Calculate voice drop cost in cents
 */
export function calculateVoiceDropCost(characterCount: number): number {
  // ElevenLabs: ~$0.30 per 1000 characters
  const generationCost = (characterCount / 1000) * 30;

  // RVM delivery: ~$0.02-0.05 per drop
  const deliveryCost = 3; // $0.03

  return Math.ceil(generationCost + deliveryCost);
}

/**
 * Estimate voice drop duration from text
 * Average speaking rate: ~150 words per minute
 */
export function estimateVoiceDropDuration(text: string): number {
  const words = text.split(/\s+/).length;
  const minutes = words / 150;
  return Math.ceil(minutes * 60); // Return seconds
}

// ============================================
// LEGACY API FUNCTIONS
// ============================================

/**
 * Get available voices from ElevenLabs API
 */
export async function getVoices(): Promise<
  Array<{
    voice_id: string;
    name: string;
    category: string;
    preview_url: string;
  }>
> {
  const response = await elevenlabsRequest('/voices');
  const data = await response.json();

  return data.voices.map((voice: Record<string, unknown>) => ({
    voice_id: voice.voice_id,
    name: voice.name,
    category: voice.category,
    preview_url: voice.preview_url,
  }));
}

/**
 * Get voice details
 */
export async function getVoice(voiceId: string): Promise<{
  voice_id: string;
  name: string;
  category: string;
  description: string;
  preview_url: string;
}> {
  const response = await elevenlabsRequest(`/voices/${voiceId}`);
  const voice = await response.json();

  return {
    voice_id: voice.voice_id,
    name: voice.name,
    category: voice.category,
    description: voice.description,
    preview_url: voice.preview_url,
  };
}

/**
 * Get user subscription info
 */
export async function getSubscription(): Promise<{
  character_count: number;
  character_limit: number;
  voice_limit: number;
}> {
  const response = await elevenlabsRequest('/user/subscription');
  const data = await response.json();

  return {
    character_count: data.character_count,
    character_limit: data.character_limit,
    voice_limit: data.voice_limit,
  };
}
