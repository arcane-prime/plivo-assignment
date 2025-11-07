import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { pubsub } from "./pubsub";
import { recordSMS, recordCall, getMetrics, getLastEvents } from "./metrics";
import { SMSPayload, CallPayload } from "./types";
import { validateSMSPayload, validateCallPayload } from "./validation";

export async function createApp() {
  const app = express();
  app.use(cors());
  app.use(bodyParser.json());

  app.post("/api/events/sms", async (req, res) => {
    const payload = req.body;
    if (!validateSMSPayload(payload)) {
      return res.status(400).json({ 
        error: "invalid payload",
        message: "Missing required fields: clientId, messageId, status, or timestamp"
      });
    }
    try {
      await recordSMS(payload);
      await pubsub.publish(`client:${payload.clientId}:sms`, payload);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("Error recording SMS event", err);
      return res.status(500).json({ error: "internal error" });
    }
  });

  app.post("/api/events/call", async (req, res) => {
    const payload = req.body;
    if (!validateCallPayload(payload)) {
      return res.status(400).json({ 
        error: "invalid payload",
        message: "Missing required fields: clientId, callId, status, or timestamp"
      });
    }
    try {
      await recordCall(payload);
      await pubsub.publish(`client:${payload.clientId}:call`, payload);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("Error recording call event", err);
      return res.status(500).json({ error: "internal error" });
    }
  });

  app.get("/api/metrics/:clientId", async (req, res) => {
    const clientId = req.params.clientId;
    try {
      const data = await getMetrics(clientId);
      res.json(data);
    } catch (err) {
      console.error("Error fetching metrics", { clientId, error: err });
      res.status(500).json({ error: "internal error" });
    }
  });

  app.get("/api/last/:clientId", async (req, res) => {
    const clientId = req.params.clientId;
    try {
      const data = await getLastEvents(clientId);
      res.json(data);
    } catch (err) {
      console.error("Error fetching last events", { clientId, error: err });
      res.status(500).json({ error: "internal error" });
    }
  });

  app.get("/health", (_req, res) => res.send("ok"));

  return app;
}
