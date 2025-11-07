export type SMSStatus = 'delivered' | 'failed' | 'sent';
export type CallStatus = 'connected' | 'ringing' | 'ended' | 'failed';

export type SMSPayload = {
  clientId: string;
  messageId: string;
  status: SMSStatus;
  timestamp: string;
};

export type CallPayload = {
  clientId: string;
  callId: string;
  status: CallStatus;
  duration?: number;
  timestamp: string;
};

export type AggregatedSMS = {
  total: number;
  delivered: number;
  failed: number;
  sent: number;
  successRate?: number;
};

export type AggregatedCalls = {
  total: number;
  ringing: number;
  connected: number;
  ended: number;
  failed: number;
  totalDuration: number;
  activeCalls?: number;
  avgDuration?: number;
};
