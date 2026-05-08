import Anthropic from '@anthropic-ai/sdk';
import { CONFIG } from './config';
import { createSession, upsertFileRecord, addLineRange, getFilesRead } from './memory/sessionStore';
import { toolSchemas, dispatchTool } from './tools/index';
import type { SessionState, AgentEvent, AgentResponse } from './types';

const SYSTEM_PROMPT = `You are FileMind, a structure-aware code navigation agent. You answer questions about codebases by EXPLORING them with tools — never guessing.

Your philosophy:
1. START with tree("/") to understand the project shape
2. INFER intent from folder/file names before reading content
3. READ selectively — only the files and line ranges relevant to the query
4. FOLLOW imports — use jump() to trace where things come from
5. BUILD understanding incrementally — summarize files you read, cache them

Tool usage rules:
- Never read a file you haven't seen in the tree first
- Prefer grep() over reading whole files when searching for patterns
- When you read a file, note what it exports and what it imports
- Always cite which files and line numbers your answer comes from
- If you don't know, say "I need to check X first" and use a tool

Answer format:
- Lead with a direct answer
- Follow with "How I found this:" — list the files you navigated, in order
- End with "Relevant code:" — show the specific lines (not entire files)`;

export class FileMindAgent {
  private client: Anthropic;
  private session: SessionState;
  private onEvent?: (event: AgentEvent) => void;

  constructor(targetPath: string, onEvent?: (event: AgentEvent) => void) {
    this.client = new Anthropic({ apiKey: CONFIG.anthropicApiKey });
    this.session = createSession(targetPath);
    this.onEvent = onEvent;
  }

  private emit(event: AgentEvent): void {
    this.onEvent?.(event);
  }

  getSession(): SessionState {
    return this.session;
  }

  async run(userQuery: string): Promise<AgentResponse> {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: userQuery },
    ];

    const navigationTrace: AgentResponse['navigationTrace'] = [];
    let iterationCount = 0;
    let finalAnswer = '';
    const seenToolCalls = new Set<string>();

    while (iterationCount < CONFIG.maxIterations) {
      iterationCount++;

      let response: Anthropic.Message;
      try {
        response = await this.client.messages.create({
          model: CONFIG.models.agent,
          system: SYSTEM_PROMPT,
          messages,
          tools: toolSchemas as Anthropic.Tool[],
          max_tokens: 4096,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.emit({ type: 'error', error: message });
        finalAnswer = `Agent encountered an error: ${message}`;
        break;
      }

      messages.push({ role: 'assistant', content: response.content });

      if (response.stop_reason === 'end_turn') {
        const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
        finalAnswer = textBlock?.text ?? '';
        this.emit({ type: 'final', content: finalAnswer });
        break;
      }

      if (response.stop_reason === 'tool_use') {
        const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type !== 'tool_use') continue;

          const input = block.input as Record<string, unknown>;

          // Detect repeated identical tool calls (loop guard)
          const callKey = `${block.name}:${JSON.stringify(input)}`;
          if (seenToolCalls.has(callKey)) {
            toolResultBlocks.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: `You already called ${block.name} with these exact inputs. The result was the same. Try a different approach.`,
            });
            continue;
          }
          seenToolCalls.add(callKey);

          this.emit({ type: 'tool_call', tool: block.name, input });

          const output = dispatchTool(block.name, input, this.session);

          // Update session for file reads
          if (block.name === 'read' && output.metadata?.filePath) {
            const { filePath, imports = [], exports: expts = [] } = output.metadata;
            const readInput = input as { path: string; start_line?: number; end_line?: number };
            this.session = upsertFileRecord(this.session, filePath, { imports, exports: expts });
            if (readInput.start_line && readInput.end_line) {
              this.session = addLineRange(this.session, filePath, readInput.start_line, readInput.end_line);
            }
          }

          const summary = output.content.slice(0, 120).replace(/\n/g, ' ');
          navigationTrace.push({ tool: block.name, input, summary });
          this.emit({ type: 'tool_result', tool: block.name, summary });

          toolResultBlocks.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: output.content,
          });
        }

        messages.push({ role: 'user', content: toolResultBlocks });
        continue;
      }

      // Unexpected stop reason
      finalAnswer = `Agent stopped unexpectedly (stop_reason: ${response.stop_reason}). Check tool definitions.`;
      break;
    }

    if (iterationCount >= CONFIG.maxIterations && !finalAnswer) {
      const lastAssistant = messages.findLast(
        (m): m is Anthropic.MessageParam & { role: 'assistant' } => m.role === 'assistant'
      );
      const lastText = Array.isArray(lastAssistant?.content)
        ? lastAssistant.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text
        : undefined;
      finalAnswer = `Explored ${CONFIG.maxIterations} steps without a complete answer. Here's what I found so far:\n\n${lastText ?? 'No partial answer available.'}`;
    }

    this.emit({ type: 'done', iterationCount });

    return {
      answer: finalAnswer,
      navigationTrace,
      filesRead: getFilesRead(this.session),
      iterationCount,
      sessionId: this.session.sessionId,
    };
  }
}
