import Anthropic from '@anthropic-ai/sdk';
import { CONFIG } from './config';
import { createSession, getFilesRead } from './memory/sessionStore';
import { toolSchemas, dispatchTool } from './tools/index';
import type { ToolDependencies } from './tools/index';
import { withRetry } from './utils/retry';
import type { SessionState, AgentEvent, AgentResponse } from './types';

const SYSTEM_PROMPT = `You are FileMind, a structure-aware code navigation agent. You answer questions about codebases by EXPLORING them with tools — never guessing.

Your philosophy:
1. START with tree("/") to understand the project shape
2. INFER intent from folder/file names before reading content
3. READ selectively — only the files and line ranges relevant to the query
4. FOLLOW imports — when a file imports another local file, use jump or read to navigate it
5. SEARCH precisely — use grep to find symbols or patterns across the whole codebase
6. SUMMARIZE when you need a quick overview of a file without reading every line
7. BUILD understanding incrementally — avoid re-reading files or re-running identical searches

Available tools: tree, read, grep, jump, summarize
Tool usage rules:
- "/" and "." both refer to the project root — use them interchangeably
- Paths are always relative to the project root: "src/utils/jwt.ts" not "/repo/src/utils/jwt.ts"
- Never read a file you haven't seen in the tree or found via grep first
- Always cite which files and line numbers your answer comes from
- If you don't know, say "I need to check X first" and use a tool
- The project root may be the FileMind agent's own source code (src/, package.json, etc.) — that is a valid codebase to explore

Answer format:
- Lead with a direct answer
- Follow with "How I found this:" — list the files you navigated, in order
- End with "Relevant code:" — show the specific lines (not entire files)`;

export class FileMindAgent {
  private client: Anthropic;
  private session: SessionState;
  private onEvent?: (event: AgentEvent) => void;
  private deps: ToolDependencies;

  constructor(
    targetPath: string,
    onEvent?: (event: AgentEvent) => void,
    deps: ToolDependencies = {}
  ) {
    this.client = new Anthropic({ apiKey: CONFIG.anthropicApiKey });
    this.session = createSession(targetPath);
    this.onEvent = onEvent;
    this.deps = { ...this.createDefaultToolDeps(), ...deps };
  }

  private createDefaultToolDeps(): ToolDependencies {
    return {
      summarizeFile: async (content: string) => {
        const response = await withRetry(() =>
          this.client.messages.create({
            model: CONFIG.models.summarizer,
            max_tokens: 512,
            messages: [
              {
                role: 'user',
                content:
                  `Summarize this file in 3-5 sentences. Cover: what it does, what it exports, ` +
                  `and any notable dependencies. Be specific.\n\n${content}`,
              },
            ],
          })
        );
        const textBlock = response.content.find(
          (b): b is Anthropic.TextBlock => b.type === 'text'
        );
        return textBlock?.text.trim() ?? 'No summary returned.';
      },
    };
  }

  private emit(event: AgentEvent): void {
    this.onEvent?.(event);
  }

  getSession(): SessionState {
    return this.session;
  }

  async run(userQuery: string): Promise<AgentResponse> {
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userQuery }];

    const navigationTrace: AgentResponse['navigationTrace'] = [];
    let iterationCount = 0;
    let finalAnswer = '';
    const seenToolCalls = new Set<string>();

    while (iterationCount < CONFIG.maxIterations) {
      iterationCount++;

      let response: Anthropic.Message;
      try {
        response = await withRetry(() =>
          this.client.messages.create({
            model: CONFIG.models.agent,
            system: SYSTEM_PROMPT,
            messages,
            tools: toolSchemas as Anthropic.Tool[],
            max_tokens: 4096,
          })
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.emit({ type: 'error', error: message });
        finalAnswer = `Agent encountered an error: ${message}`;
        break;
      }

      messages.push({ role: 'assistant', content: response.content });

      if (response.stop_reason === 'end_turn') {
        const textBlock = response.content.find(
          (b): b is Anthropic.TextBlock => b.type === 'text'
        );
        finalAnswer = textBlock?.text ?? '';
        this.emit({ type: 'final', content: finalAnswer });
        break;
      }

      if (response.stop_reason === 'tool_use') {
        const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type !== 'tool_use') continue;

          const input = block.input as Record<string, unknown>;

          // Loop guard — identical call seen before
          const callKey = `${block.name}:${JSON.stringify(input)}`;
          if (seenToolCalls.has(callKey)) {
            toolResultBlocks.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: `You already called ${block.name} with these exact inputs. Try a different path or approach.`,
            });
            continue;
          }
          seenToolCalls.add(callKey);

          this.emit({ type: 'tool_call', tool: block.name, input });

          const { output, updatedSession } = await dispatchTool(
            block.name,
            input,
            this.session,
            this.deps
          );
          this.session = updatedSession;

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

      finalAnswer = `Agent stopped unexpectedly (stop_reason: ${response.stop_reason}).`;
      break;
    }

    if (iterationCount >= CONFIG.maxIterations && !finalAnswer) {
      let lastText: string | undefined;
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg && msg.role === 'assistant' && Array.isArray(msg.content)) {
          const textBlock = msg.content.find(
            (b): b is Anthropic.TextBlock =>
              typeof b === 'object' && b !== null && 'type' in b && b.type === 'text'
          );
          if (textBlock) {
            lastText = textBlock.text;
            break;
          }
        }
      }
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
