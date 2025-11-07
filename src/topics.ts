const topics: Set<string> = new Set();

export function createTopic(topic: string): { created: boolean; exists: boolean } {
  if (!topic || topic.trim().length === 0) {
    return { created: false, exists: false };
  }
  const trimmedTopic = topic.trim();
  if (topics.has(trimmedTopic)) {
    return { created: false, exists: true };
  }
  topics.add(trimmedTopic);
  return { created: true, exists: false };
}

export function deleteTopic(topic: string): boolean {
  return topics.delete(topic);
}

export function topicExists(topic: string): boolean {
  return topics.has(topic);
}

export function getAllTopics(): string[] {
  return Array.from(topics);
}

