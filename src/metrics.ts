import dotenv from "dotenv";
import { SMSPayload, CallPayload } from "./types";
dotenv.config();

const MAX_LAST = parseInt(process.env.MAX_LAST_EVENTS || "100", 10);

interface SMSMetrics {
  total: number;
  delivered: number;
  failed: number;
  sent: number;
  lastUpdated: string | null;
}

interface CallMetrics {
  total: number;
  ringing: number;
  connected: number;
  ended: number;
  failed: number;
  totalDuration: number;
  lastUpdated: string | null;
}

const smsEvents: Map<string, SMSPayload[]> = new Map();
const callEvents: Map<string, CallPayload[]> = new Map();
const smsMetrics: Map<string, SMSMetrics> = new Map();
const callMetrics: Map<string, CallMetrics> = new Map();

function getOrInitSMSMetrics(clientId: string): SMSMetrics {
  if (!smsMetrics.has(clientId)) {
    smsMetrics.set(clientId, {
      total: 0,
      delivered: 0,
      failed: 0,
      sent: 0,
      lastUpdated: null,
    });
  }
  return smsMetrics.get(clientId)!;
}

function getOrInitCallMetrics(clientId: string): CallMetrics {
  if (!callMetrics.has(clientId)) {
    callMetrics.set(clientId, {
      total: 0,
      ringing: 0,
      connected: 0,
      ended: 0,
      failed: 0,
      totalDuration: 0,
      lastUpdated: null,
    });
  }
  return callMetrics.get(clientId)!;
}

export async function recordSMS(event: SMSPayload) {
  try {
    if (!smsEvents.has(event.clientId)) {
      smsEvents.set(event.clientId, []);
    }
    const events = smsEvents.get(event.clientId)!;
    events.unshift(event);
    if (events.length > MAX_LAST) {
      events.splice(MAX_LAST);
    }

    const metrics = getOrInitSMSMetrics(event.clientId);
    metrics.total += 1;
    if (event.status === "delivered") metrics.delivered += 1;
    else if (event.status === "failed") metrics.failed += 1;
    else if (event.status === "sent") metrics.sent += 1;
    metrics.lastUpdated = new Date().toISOString();
  } catch (err) {
    console.error("Error recording SMS event", { event, error: err });
    throw err;
  }
}

export async function recordCall(event: CallPayload) {
  try {
    if (!callEvents.has(event.clientId)) {
      callEvents.set(event.clientId, []);
    }
    const events = callEvents.get(event.clientId)!;
    events.unshift(event);
    if (events.length > MAX_LAST) {
      events.splice(MAX_LAST);
    }

    const metrics = getOrInitCallMetrics(event.clientId);
    metrics.total += 1;
    if (event.status === "ringing") metrics.ringing += 1;
    else if (event.status === "connected") metrics.connected += 1;
    else if (event.status === "ended") metrics.ended += 1;
    else if (event.status === "failed") metrics.failed += 1;
    
    if (event.duration && typeof event.duration === "number") {
      metrics.totalDuration += event.duration;
    }
    metrics.lastUpdated = new Date().toISOString();
  } catch (err) {
    console.error("Error recording call event", { event, error: err });
    throw err;
  }
}

export async function getMetrics(clientId: string) {
  try {
    const sms = smsMetrics.get(clientId) || getOrInitSMSMetrics(clientId);
    const calls = callMetrics.get(clientId) || getOrInitCallMetrics(clientId);

    const smsTotal = sms.total;
    const delivered = sms.delivered;
    const failed = sms.failed;
    const sent = sms.sent;
    const smsSuccessRate = smsTotal > 0 ? (delivered / smsTotal) * 100 : 0;

    const callsTotal = calls.total;
    const ringing = calls.ringing;
    const connected = calls.connected;
    const ended = calls.ended;
    const callFailed = calls.failed;
    const totalDuration = calls.totalDuration;
    const avgDuration = ended > 0 ? totalDuration / ended : 0;

    const activeCalls = Math.max(0, connected - ended);

    return {
      clientId,
      sms: {
        total: smsTotal,
        delivered,
        failed,
        sent,
        successRate: Number(smsSuccessRate.toFixed(2)),
      },
      calls: {
        total: callsTotal,
        ringing,
        connected,
        ended,
        failed: callFailed,
        totalDuration,
        avgDuration: Number(avgDuration.toFixed(2)),
        activeCalls,
      },
      lastUpdated: sms.lastUpdated || calls.lastUpdated || null,
    };
  } catch (err) {
    console.error("Error fetching metrics", { clientId, error: err });
    throw err;
  }
}

export async function getLastEvents(clientId: string) {
  try {
    const sms = smsEvents.get(clientId) || [];
    const calls = callEvents.get(clientId) || [];
    return {
      sms,
      calls,
    };
  } catch (err) {
    console.error("Error fetching last events", { clientId, error: err });
    throw err;
  }
}
