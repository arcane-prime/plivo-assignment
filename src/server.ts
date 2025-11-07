import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { getMetrics, getLastEvents } from "./metrics";
import { createTopic, deleteTopic, topicExists } from "./topics";
import { unsubscribeAllFromTopic, getAllTopicsWithSubscribers } from "./subscribers";

export async function createApp() {
  const app = express();
  app.use(cors());
  app.use(bodyParser.json());

  app.post("/api/topics", async (req, res) => {
    const { name } = req.body;
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({ 
        error: "invalid payload",
        message: "Missing or invalid name field"
      });
    }
    try {
      const result = createTopic(name.trim());
      if (result.exists) {
        return res.status(409).json({ error: "Topic already exists" });
      }
      if (result.created) {
        return res.status(201).json({ status: "created", topic: name.trim() });
      } else {
        return res.status(400).json({ error: "invalid payload" });
      }
    } catch (err) {
      console.error("Error creating topic", err);
      return res.status(500).json({ error: "internal error" });
    }
  });

  app.delete("/api/topics/:name", async (req, res) => {
    const topicName = req.params.name;
    try {
      if (!topicExists(topicName)) {
        return res.status(404).json({ error: "Topic not found" });
      }
      await unsubscribeAllFromTopic(topicName);
      deleteTopic(topicName);
      return res.status(200).json({ status: "deleted", topic: topicName });
    } catch (err) {
      console.error("Error deleting topic", err);
      return res.status(500).json({ error: "internal error" });
    }
  });

  app.get("/api/topics", async (_req, res) => {
    try {
      const topics = getAllTopicsWithSubscribers();
      return res.json({ topics });
    } catch (err) {
      console.error("Error fetching topics", err);
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

  app.get("/ping", (_req, res) => res.send("pong"));

  return app;
}
