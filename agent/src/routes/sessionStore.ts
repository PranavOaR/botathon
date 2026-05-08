import type { AgentResponse } from '../types';

const completedSessions = new Map<string, AgentResponse>();

export function saveCompletedSession(response: AgentResponse): void {
  completedSessions.set(response.sessionId, response);
}

export function getCompletedSession(sessionId: string): AgentResponse | undefined {
  return completedSessions.get(sessionId);
}

export function clearCompletedSessionsForTests(): void {
  completedSessions.clear();
}
