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

type WsExt = WebSocket & {
  isAlive?: boolean;
  unsubscribers?: Map<string, () => Promise<void>>;
};

async function start() {
  const app = await createApp();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });
  
  setWebSocketServer(wss);

  wss.on("connection", (rawWs) => {
    const ws = rawWs as WsExt;
    ws.isAlive = true;
    ws.unsubscribers = new Map();

    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        const { type, topic, client_id, last_n, request_id, message } = msg;
        if (!type || !topic) return;

        if (type === "subscribe") {
          if (!client_id) return;
          if (!topicExists(topic)) {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: "error",
                topic,
                client_id,
                request_id,
                error: "TOPIC_NOT_FOUND"
              }));
            }
            return;
          }
          const subscriptionKey = `${topic}:${client_id}`;
          if (ws.unsubscribers!.has(subscriptionKey)) return;

          const handler = (payload: any) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ 
                type: "message",
                topic,
                client_id,
                request_id,
                payload 
              }));
            }
          };
          const unsubscribe = await pubsub.subscribe(topic, handler);
          ws.unsubscribers!.set(subscriptionKey, unsubscribe);
          registerSubscription(topic, subscriptionKey);

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
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ 
                  type: "last_n",
                  topic,
                  client_id,
                  request_id,
                  events: lastNEvents 
                }));
              }
            } catch (err) {
              console.error("Error fetching last events for WebSocket", err);
            }
          }
        } else if (type === "unsubscribe") {
          if (!client_id) return;
          if (!topicExists(topic)) {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: "error",
                topic,
                client_id,
                request_id,
                error: "TOPIC_NOT_FOUND"
              }));
            }
            return;
          }
          const subscriptionKey = `${topic}:${client_id}`;
          const unsub = ws.unsubscribers!.get(subscriptionKey);
          if (unsub) {
            await unsub();
            ws.unsubscribers!.delete(subscriptionKey);
            unregisterSubscription(topic, subscriptionKey);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: "unsubscribed",
                topic,
                client_id,
                request_id
              }));
            }
          }
        } else if (type === "publish") {
          if (!message) {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: "error",
                topic,
                request_id,
                error: "Missing message field"
              }));
            }
            return;
          }
          if (!topicExists(topic)) {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: "error",
                topic,
                request_id,
                error: "TOPIC_NOT_FOUND"
              }));
            }
            return;
          }
          try {
            await pubsub.publish(topic, message);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: "published",
                topic,
                request_id
              }));
            }
          } catch (err) {
            console.error("Error publishing message", err);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: "error",
                topic,
                request_id,
                error: "Failed to publish message"
              }));
            }
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