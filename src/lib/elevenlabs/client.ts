/**
 * ElevenLabs Client
 * 
 * Client for ElevenLabs voice synthesis:
 * - Text-to-speech generation
 * - Voice management
 * - Stream audio generation
 * 
 * Documentation: https://elevenlabs.io/docs/api-reference
 */

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

interface ElevenLabsConfig {
  apiKey: string;
  defaultVoiceId: string;
}

function getConfig(): ElevenLabsConfig | null {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.warn("ELEVENLABS_API_KEY is not set - Voice features will be disabled");
    return null;
  }
  
  return {
    apiKey,
    defaultVoiceId: process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM", // Rachel (default)
  };
}

async function elevenlabsRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const config = getConfig();
  if (!config) throw new Error("ElevenLabs is not configured");

  const response = await fetch(`${ELEVENLABS_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "xi-api-key": config.apiKey,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail?.message || `ElevenLabs API error: ${response.status}`);
  }

  return response;
}

/**
 * Voice settings for TTS
 */
export interface VoiceSettings {
  stability?: number; // 0-1, default 0.5
  similarity_boost?: number; // 0-1, default 0.75
  style?: number; // 0-1, default 0
  use_speaker_boost?: boolean; // default true
}

/**
 * Generate speech from text
 * Returns audio as ArrayBuffer
 */
export async function textToSpeech({
  text,
  voiceId,
  modelId = "eleven_monolingual_v1",
  voiceSettings,
}: {
  text: string;
  voiceId?: string;
  modelId?: string;
  voiceSettings?: VoiceSettings;
}): Promise<ArrayBuffer> {
  const config = getConfig();
  if (!config) throw new Error("ElevenLabs is not configured");

  const voice = voiceId || config.defaultVoiceId;

  const response = await elevenlabsRequest(`/text-to-speech/${voice}`, {
    method: "POST",
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: voiceSettings || {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
    headers: {
      "Accept": "audio/mpeg",
    },
  });

  return response.arrayBuffer();
}

/**
 * Generate speech and stream the audio
 * Returns a ReadableStream
 */
export async function textToSpeechStream({
  text,
  voiceId,
  modelId = "eleven_monolingual_v1",
  voiceSettings,
}: {
  text: string;
  voiceId?: string;
  modelId?: string;
  voiceSettings?: VoiceSettings;
}): Promise<ReadableStream<Uint8Array> | null> {
  const config = getConfig();
  if (!config) throw new Error("ElevenLabs is not configured");

  const voice = voiceId || config.defaultVoiceId;

  const response = await elevenlabsRequest(`/text-to-speech/${voice}/stream`, {
    method: "POST",
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: voiceSettings || {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
    headers: {
      "Accept": "audio/mpeg",
    },
  });

  return response.body;
}

/**
 * Get available voices
 */
export async function getVoices(): Promise<Array<{
  voice_id: string;
  name: string;
  category: string;
  preview_url: string;
}>> {
  const response = await elevenlabsRequest("/voices");
  const data = await response.json();
  
  return data.voices.map((voice: any) => ({
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
 * Get user subscription info (for quota tracking)
 */
export async function getSubscription(): Promise<{
  character_count: number;
  character_limit: number;
  voice_limit: number;
}> {
  const response = await elevenlabsRequest("/user/subscription");
  const data = await response.json();
  
  return {
    character_count: data.character_count,
    character_limit: data.character_limit,
    voice_limit: data.voice_limit,
  };
}
