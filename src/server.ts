import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { getMetrics, getLastEvents } from "./metrics";

export async function createApp() {
  const app = express();
  app.use(cors());
  app.use(bodyParser.json());

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

  app.get("/ping", (_req, res) => res.send("pong"));

  return app;
}
