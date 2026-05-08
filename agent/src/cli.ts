import { FileMindAgent } from './agent';
import type { AgentEvent } from './types';

async function main(): Promise<void> {
  const [, , query, targetPath] = process.argv;

  if (!query || !targetPath) {
    console.error('Usage: npx tsx src/cli.ts "<query>" <path-to-repo>');
    console.error('Example: npx tsx src/cli.ts "How does auth work?" ../demo/sample-repos/nextjs-starter');
    process.exit(1);
  }

  console.log(`\nFileMind — querying: ${targetPath}`);
  console.log(`Query: ${query}\n`);
  console.log('─'.repeat(60));

  const agent = new FileMindAgent(targetPath, (event: AgentEvent) => {
    switch (event.type) {
      case 'tool_call':
        process.stdout.write(`\n[TOOL] ${event.tool}(${JSON.stringify(event.input)})\n`);
        break;
      case 'tool_result':
        process.stdout.write(`[→]   ${event.summary}\n`);
        break;
      case 'final':
        console.log('\n' + '═'.repeat(60));
        console.log('ANSWER');
        console.log('═'.repeat(60));
        console.log(event.content);
        break;
      case 'done':
        console.log('\n' + '─'.repeat(60));
        console.log(`Done in ${event.iterationCount} iteration(s)`);
        break;
      case 'error':
        console.error(`\n[ERROR] ${event.error}`);
        break;
    }
  });

  const response = await agent.run(query);
  console.log(`Files read: ${response.filesRead.join(', ') || 'none'}`);
  console.log(`Session: ${response.sessionId}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
