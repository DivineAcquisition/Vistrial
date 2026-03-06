// ============================================
// TELNYX API CLIENT (Class-based)
// Used by send-sms.ts, numbers.ts
// ============================================

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_BASE_URL = 'https://api.telnyx.com/v2';

export interface TelnyxResponse<T> {
  data: T;
  meta?: any;
}

export interface TelnyxError {
  code: string;
  title: string;
  detail: string;
}

class TelnyxApiClient {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    if (!TELNYX_API_KEY) {
      console.warn('TELNYX_API_KEY is not configured — Telnyx features disabled');
    }
    this.apiKey = TELNYX_API_KEY || '';
    this.baseUrl = TELNYX_BASE_URL;
  }

  async request<T>(
    method: string,
    endpoint: string,
    body?: any
  ): Promise<TelnyxResponse<T>> {
    if (!this.apiKey) {
      throw new Error('TELNYX_API_KEY is not configured');
    }

    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
      const error = data.errors?.[0] || { detail: 'Unknown error' };
      throw new Error(error.detail || error.title || 'Telnyx API error');
    }

    return data;
  }

  async get<T>(endpoint: string): Promise<TelnyxResponse<T>> {
    return this.request<T>('GET', endpoint);
  }

  async post<T>(endpoint: string, body: any): Promise<TelnyxResponse<T>> {
    return this.request<T>('POST', endpoint, body);
  }

  async patch<T>(endpoint: string, body: any): Promise<TelnyxResponse<T>> {
    return this.request<T>('PATCH', endpoint, body);
  }

  async delete<T>(endpoint: string): Promise<TelnyxResponse<T>> {
    return this.request<T>('DELETE', endpoint);
  }
}

export const telnyxApiClient = new TelnyxApiClient();
