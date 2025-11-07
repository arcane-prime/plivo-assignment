# Pub/Sub WebSocket Service

## What This Service Does

This is a real-time publish/subscribe messaging service built with Node.js, Express, and WebSockets. It allows clients to:

- **Create Topics**: Create named topics for organizing messages
- **Subscribe to Topics**: Connect via WebSocket and subscribe to specific topics to receive real-time messages
- **Publish Messages**: Send messages to topics that all subscribed clients will receive
- **Get Recent Events**: Request the last N events when subscribing to catch up on missed messages
- **Health Monitoring**: Check service health and statistics

The service uses in-memory storage (no external databases required) and includes features like:
- WebSocket heartbeat/ping-pong for connection health
- Backpressure handling for slow clients
- Automatic cleanup of subscriptions when clients disconnect

## Backpressure Policy

The service implements automatic backpressure handling to prevent memory overflow when clients are slow to consume messages. Messages are automatically dropped if:
- The WebSocket buffer exceeds 1MB (configurable via `MAX_WS_BUFFER_SIZE` environment variable)
- More than 100 messages are pending (configurable via `MAX_PENDING_MESSAGES` environment variable)

This ensures that slow clients don't cause the server to consume excessive memory, while fast clients continue to receive messages normally.

## Getting Started

### Prerequisites

- Docker and Docker Compose installed on your system

### Starting the Service

1. **Build and start the service:**
   ```bash
   docker-compose up --build
   ```

2. **Start in detached mode (runs in background):**
   ```bash
   docker-compose up -d --build
   ```

3. **Stop the service:**
   ```bash
   docker-compose down
   ```

The service will start on **port 4000**. You can access:
- HTTP API: `http://localhost:4000`
- WebSocket endpoint: `ws://localhost:4000/ws`

### Quick Test

Once the service is running, you can test it:

1. **Check if service is running:**
   ```bash
   curl http://localhost:4000/ping
   ```
   Should return: `pong`

