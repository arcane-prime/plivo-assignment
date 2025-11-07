import http from "http";
import WebSocket, { WebSocketServer } from "ws";
import dotenv from "dotenv";
import { createApp } from "./server";
import { pubsub } from "./pubsub";
import { getLastEvents } from "./metrics";
import { topicExists } from "./topics";
import { setWebSocketServer, registerSubscription, unregisterSubscription } from "./subscribers";
dotenv.config();

const PORT = Number(process.env.PORT || 4000);
const WS_HEARTBEAT_MS = Number(process.env.WS_HEARTBEAT_MS || 30000);
const MAX_BUFFER_SIZE = Number(process.env.MAX_WS_BUFFER_SIZE || 1024 * 1024); // 1MB default
const MAX_PENDING_MESSAGES = Number(process.env.MAX_PENDING_MESSAGES || 100);

type WsExt = WebSocket & {
  isAlive?: boolean;
  unsubscribers?: Map<string, () => Promise<void>>;
  pendingMessages?: number;
};

async function start() {
  const app = await createApp();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });
  
  setWebSocketServer(wss);

  function safeSend(ws: WsExt, data: string): boolean {
    if (ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    const bufferedAmount = ws.bufferedAmount || 0;
    const pendingMessages = ws.pendingMessages || 0;

    if (bufferedAmount >= MAX_BUFFER_SIZE) {
      console.warn(`WebSocket buffer full (${bufferedAmount} bytes), dropping message`);
      return false;
    }

    if (pendingMessages >= MAX_PENDING_MESSAGES) {
      console.warn(`Too many pending messages (${pendingMessages}), dropping message`);
      return false;
    }

    try {
      ws.pendingMessages = (ws.pendingMessages || 0) + 1;
      ws.send(data, (err) => {
        if (ws.pendingMessages) {
          ws.pendingMessages = Math.max(0, ws.pendingMessages - 1);
        }
        if (err) {
          console.error("WebSocket send error", err);
        }
      });
      return true;
    } catch (err) {
      if (ws.pendingMessages) {
        ws.pendingMessages = Math.max(0, ws.pendingMessages - 1);
      }
      console.error("WebSocket send exception", err);
      return false;
    }
  }

  wss.on("connection", (rawWs) => {
    const ws = rawWs as WsExt;
    ws.isAlive = true;
    ws.unsubscribers = new Map();
    ws.pendingMessages = 0;

    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        const { type, topic, client_id, last_n, request_id, message } = msg;
        if (!type) return;

        if (type === "ping") {
          safeSend(ws, JSON.stringify({
            type: "pong",
            request_id: request_id || undefined,
            ts: new Date().toISOString()
          }));
          return;
        }

        if (!topic) return;

        if (type === "subscribe") {
          if (!client_id) return;
          if (!topicExists(topic)) {
            safeSend(ws, JSON.stringify({
              type: "error",
              topic,
              request_id: request_id || undefined,
              error: {
                code: "TOPIC_NOT_FOUND",
                message: "Topic not found"
              },
              ts: new Date().toISOString()
            }));
            return;
          }
          const subscriptionKey = `${topic}:${client_id}`;
          if (ws.unsubscribers!.has(subscriptionKey)) return;

          const handler = (payload: any) => {
            safeSend(ws, JSON.stringify({ 
              type: "event",
              topic,
              request_id: request_id || undefined,
              message: payload,
              ts: new Date().toISOString()
            }));
          };
          const unsubscribe = await pubsub.subscribe(topic, handler);
          ws.unsubscribers!.set(subscriptionKey, unsubscribe);
          registerSubscription(topic, subscriptionKey);

          safeSend(ws, JSON.stringify({
            type: "ack",
            topic,
            request_id: request_id || undefined,
            ts: new Date().toISOString()
          }));

          if (last_n && last_n > 0 && client_id) {
            try {
              const last = await getLastEvents(client_id);
              const allEvents = [...(last.sms || []), ...(last.calls || [])];
              const sortedEvents = allEvents.sort((a, b) => {
                const timeA = new Date(a.timestamp).getTime();
                const timeB = new Date(b.timestamp).getTime();
                return timeB - timeA;
              });
              const lastNEvents = sortedEvents.slice(0, last_n);
              safeSend(ws, JSON.stringify({ 
                type: "info",
                topic,
                request_id: request_id || undefined,
                message: {
                  events: lastNEvents
                },
                ts: new Date().toISOString()
              }));
            } catch (err) {
              console.error("Error fetching last events for WebSocket", err);
            }
          }
        } else if (type === "unsubscribe") {
          if (!client_id) return;
          if (!topicExists(topic)) {
            safeSend(ws, JSON.stringify({
              type: "error",
              topic,
              request_id: request_id || undefined,
              error: {
                code: "TOPIC_NOT_FOUND",
                message: "Topic not found"
              },
              ts: new Date().toISOString()
            }));
            return;
          }
          const subscriptionKey = `${topic}:${client_id}`;
          const unsub = ws.unsubscribers!.get(subscriptionKey);
          if (unsub) {
            await unsub();
            ws.unsubscribers!.delete(subscriptionKey);
            unregisterSubscription(topic, subscriptionKey);
            safeSend(ws, JSON.stringify({
              type: "ack",
              topic,
              request_id: request_id || undefined,
              ts: new Date().toISOString()
            }));
          }
        } else if (type === "publish") {
          if (!message) {
            safeSend(ws, JSON.stringify({
              type: "error",
              topic,
              request_id: request_id || undefined,
              error: {
                code: "BAD_REQUEST",
                message: "Missing message field"
              },
              ts: new Date().toISOString()
            }));
            return;
          }
          if (!topicExists(topic)) {
            safeSend(ws, JSON.stringify({
              type: "error",
              topic,
              request_id: request_id || undefined,
              error: {
                code: "TOPIC_NOT_FOUND",
                message: "Topic not found"
              },
              ts: new Date().toISOString()
            }));
            return;
          }
          try {
            await pubsub.publish(topic, message);
            safeSend(ws, JSON.stringify({
              type: "ack",
              topic,
              request_id: request_id || undefined,
              ts: new Date().toISOString()
            }));
          } catch (err) {
            console.error("Error publishing message", err);
            safeSend(ws, JSON.stringify({
              type: "error",
              topic,
              request_id: request_id || undefined,
              error: {
                code: "INTERNAL_ERROR",
                message: "Failed to publish message"
              },
              ts: new Date().toISOString()
            }));
          }
        }
      } catch (err) {
        console.error("WebSocket message parse error", err);
      }
    });

    ws.on("close", async () => {
      for (const [key, unsub] of ws.unsubscribers!) {
        try {
          await unsub();
          const [topic] = key.split(":");
          unregisterSubscription(topic, key);
        } catch (err) {
          console.error("Error unsubscribing on WebSocket close", err);
        }
      }
      ws.unsubscribers!.clear();
    });
  });

  // heartbeat ping/pong
  const interval = setInterval(() => {
    wss.clients.forEach((client) => {
      const wsClient = client as WsExt;
      if (!wsClient.isAlive) return wsClient.terminate();
      wsClient.isAlive = false;
      wsClient.ping();
    });
  }, WS_HEARTBEAT_MS);

  server.listen(PORT, () => {
    console.log(`HTTP+WS server running on http://localhost:${PORT}`);
  });

  process.on("SIGINT", async () => {
    clearInterval(interval);
    wss.clients.forEach((client) => (client as WsExt).terminate());
    server.close(() => process.exit(0));
  });
}

start().catch((err) => {
  console.error("Failed to start server", err);
  process.exit(1);
});