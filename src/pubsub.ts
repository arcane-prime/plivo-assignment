import { EventEmitter } from "events";

export class PubSub {
  private emitter: EventEmitter;
  private listeners: Map<string, Set<(payload: any) => void>> = new Map();
  private channelListeners: Map<string, (payload: any) => void> = new Map();

  constructor() {
    this.emitter = new EventEmitter();
  }

  async publish(channel: string, payload: any) {
    this.emitter.emit(channel, payload);
  }

  async subscribe(
    channel: string,
    handler: (payload: any) => void
  ): Promise<() => Promise<void>> {
    let set = this.listeners.get(channel);
    if (!set) {
      set = new Set();
      this.listeners.set(channel, set);
      
      const channelHandler = (payload: any) => {
        const handlers = this.listeners.get(channel);
        if (handlers) {
          for (const h of Array.from(handlers)) {
            try {
              h(payload);
            } catch (err) {
              console.error("pubsub handler error", err);
            }
          }
        }
      };
      
      this.channelListeners.set(channel, channelHandler);
      this.emitter.on(channel, channelHandler);
    }
    
    set.add(handler);

    return async () => {
      set!.delete(handler);
      if (set!.size === 0) {
        this.listeners.delete(channel);
        const channelHandler = this.channelListeners.get(channel);
        if (channelHandler) {
          this.emitter.removeListener(channel, channelHandler);
          this.channelListeners.delete(channel);
        }
      }
    };
  }
}

export const pubsub = new PubSub();
