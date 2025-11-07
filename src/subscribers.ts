import { WebSocketServer } from "ws";
import { getAllTopics } from "./topics";

type WsExt = {
  unsubscribers?: Map<string, () => Promise<void>>;
};

let wssInstance: WebSocketServer | null = null;
const topicSubscriptions: Map<string, Set<string>> = new Map();

export function setWebSocketServer(wss: WebSocketServer) {
  wssInstance = wss;
}

export function registerSubscription(topic: string, subscriptionKey: string) {
  if (!topicSubscriptions.has(topic)) {
    topicSubscriptions.set(topic, new Set());
  }
  topicSubscriptions.get(topic)!.add(subscriptionKey);
}

export function unregisterSubscription(topic: string, subscriptionKey: string) {
  const subs = topicSubscriptions.get(topic);
  if (subs) {
    subs.delete(subscriptionKey);
    if (subs.size === 0) {
      topicSubscriptions.delete(topic);
    }
  }
}

export function getSubscriberCount(topic: string): number {
  return topicSubscriptions.get(topic)?.size || 0;
}

export async function unsubscribeAllFromTopic(topic: string): Promise<void> {
  if (!wssInstance) return;
  
  const subscriptionKeys = topicSubscriptions.get(topic);
  if (!subscriptionKeys) return;

  const keysToUnsubscribe = Array.from(subscriptionKeys);
  
  for (const client of wssInstance.clients) {
    const ws = client as WsExt;
    if (ws.unsubscribers) {
      for (const key of keysToUnsubscribe) {
        if (key.startsWith(`${topic}:`)) {
          const unsub = ws.unsubscribers.get(key);
          if (unsub) {
            try {
              await unsub();
              ws.unsubscribers.delete(key);
            } catch (err) {
              console.error("Error unsubscribing on topic deletion", err);
            }
          }
        }
      }
    }
  }
  
  topicSubscriptions.delete(topic);
}

export function getTotalSubscriberCount(): number {
  let total = 0;
  for (const subs of topicSubscriptions.values()) {
    total += subs.size;
  }
  return total;
}

export function getAllTopicsWithSubscribers(): Array<{ name: string; subscribers: number }> {
  const allTopicNames = getAllTopics();
  return allTopicNames.map(topic => ({
    name: topic,
    subscribers: getSubscriberCount(topic)
  }));
}

