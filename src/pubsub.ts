import Redis from "ioredis";
import dotenv from "dotenv";
dotenv.config();

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export class PubSub {
  private pub: Redis;
  private sub: Redis;

  private listeners: Map<string, Set<(msg: string) => void>> = new Map();

  constructor() {
    this.pub = new Redis(REDIS_URL);
    this.sub = new Redis(REDIS_URL);

    this.sub.on("message", (channel: string, message: string) => {
      const set = this.listeners.get(channel);
      if (set) {
        for (const fn of Array.from(set)) {
          try {
            fn(message);
          } catch (err) {
            console.error("pubsub handler error", err);
          }
        }
      }
    });

    this.sub.on("error", (e) => console.error("redis sub error", e));
    this.pub.on("error", (e) => console.error("redis pub error", e));
  }

  async publish(channel: string, payload: any) {
    const msg = typeof payload === "string" ? payload : JSON.stringify(payload);
    await this.pub.publish(channel, msg);
  }

  async subscribe(
    channel: string,
    handler: (payload: any) => void
  ): Promise<() => Promise<void>> {
    let set = this.listeners.get(channel);
    if (!set) {
      set = new Set();
      this.listeners.set(channel, set);
      try {
        await this.sub.subscribe(channel);
      } catch (err) {
        console.error("subscribe error", err);
        throw err;
      }
    }
    const wrapper = (msg: string) => {
      try {
        handler(JSON.parse(msg));
      } catch (e) {
        handler(msg);
      }
    };
    set.add(wrapper);

    return async () => {
      set!.delete(wrapper);
      if (set!.size === 0) {
        this.listeners.delete(channel);
        try {
          await this.sub.unsubscribe(channel);
        } catch (err) {
          console.error("unsubscribe error", err);
        }
      }
    };
  }
}


export const pubsub = new PubSub();