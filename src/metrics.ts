import Redis from "ioredis";
import dotenv from "dotenv";
import { SMSPayload, CallPayload } from "./types";
dotenv.config();

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const MAX_LAST = parseInt(process.env.MAX_LAST_EVENTS || "100", 10);
const redis = new Redis(REDIS_URL);

const smsAggKey = (clientId: string) => `metrics:${clientId}:sms`;
const callAggKey = (clientId: string) => `metrics:${clientId}:call`;
const smsListKey = (clientId: string) => `events:${clientId}:sms`;
const callListKey = (clientId: string) => `events:${clientId}:call`;

export async function recordSMS(event: SMSPayload) {
  const listKey = smsListKey(event.clientId);
  const aggKey = smsAggKey(event.clientId);

  try {
    await redis.lpush(listKey, JSON.stringify(event));
    await redis.ltrim(listKey, 0, MAX_LAST - 1);

    await redis.hincrby(aggKey, "total", 1);
    await redis.hincrby(aggKey, event.status, 1);
    await redis.hset(aggKey, "lastUpdated", new Date().toISOString());
  } catch (err) {
    console.error("Error recording SMS event in Redis", { event, error: err });
    throw err;
  }
}

export async function recordCall(event: CallPayload) {
  const listKey = callListKey(event.clientId);
  const aggKey = callAggKey(event.clientId);

  try {
    await redis.lpush(listKey, JSON.stringify(event));
    await redis.ltrim(listKey, 0, MAX_LAST - 1);

    await redis.hincrby(aggKey, "total", 1);
    await redis.hincrby(aggKey, event.status, 1);
    if (event.duration && typeof event.duration === "number") {
      await redis.hincrby(aggKey, "totalDuration", event.duration);
    }
    await redis.hset(aggKey, "lastUpdated", new Date().toISOString());
  } catch (err) {
    console.error("Error recording call event in Redis", { event, error: err });
    throw err;
  }
}

export async function getMetrics(clientId: string) {
  try {
    const sms = await redis.hgetall(smsAggKey(clientId));
    const calls = await redis.hgetall(callAggKey(clientId));

    const smsTotal = Number(sms.total || 0);
    const delivered = Number(sms.delivered || 0);
    const failed = Number(sms.failed || 0);
    const sent = Number(sms.sent || 0);
    const smsSuccessRate = smsTotal > 0 ? (delivered / smsTotal) * 100 : 0;

    const callsTotal = Number(calls.total || 0);
    const ringing = Number(calls.ringing || 0);
    const connected = Number(calls.connected || 0);
    const ended = Number(calls.ended || 0);
    const callFailed = Number(calls.failed || 0);
    const totalDuration = Number(calls.totalDuration || 0);
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
    console.error("Error fetching metrics from Redis", { clientId, error: err });
    throw err;
  }
}


export async function getLastEvents(clientId: string) {
  try {
    const sms = await redis.lrange(smsListKey(clientId), 0, -1);
    const calls = await redis.lrange(callListKey(clientId), 0, -1);
    return {
      sms: sms.map(s => JSON.parse(s)),
      calls: calls.map(c => JSON.parse(c))
    };
  } catch (err) {
    console.error("Error fetching last events from Redis", { clientId, error: err });
    throw err;
  }
}