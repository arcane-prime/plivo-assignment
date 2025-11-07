import http from "http";
import WebSocket, { WebSocketServer } from "ws";
import dotenv from "dotenv";
import { createApp } from "./server";
import { pubsub } from "./pubsub";
import { getLastEvents } from "./metrics";
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
        // expected shape: { action: 'subscribe'|'unsubscribe', topic: 'client:client_A:sms', sendLast: true }
        const { action, topic, sendLast } = msg;
        if (!action || !topic) return;

        if (action === "subscribe") {
          if (ws.unsubscribers!.has(topic)) return; // already subscribed
          // handler sends messages to this ws
          const handler = (payload: any) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ topic, payload }));
            }
          };
          const unsubscribe = await pubsub.subscribe(topic, handler);
          ws.unsubscribers!.set(topic, unsubscribe);

          // optionally send last events for that client/topic
          if (sendLast) {
            const parts = topic.split(":"); // client:{id}:sms
            if (parts.length === 3) {
              const clientId = parts[1];
              const type = parts[2]; // sms|call
              try {
                const last = await getLastEvents(clientId);
                const events = type === "sms" ? last.sms : last.calls;
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ topic, past: events }));
                }
              } catch (err) {
                console.error("Error fetching last events for WebSocket", err);
              }
            }
          }
        } else if (action === "unsubscribe") {
          const unsub = ws.unsubscribers!.get(topic);
          if (unsub) {
            await unsub();
            ws.unsubscribers!.delete(topic);
          }
        }
      } catch (err) {
        console.error("WebSocket message parse error", err);
      }
    });

    ws.on("close", async () => {
      for (const [, unsub] of ws.unsubscribers!) {
        try {
          await unsub();
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