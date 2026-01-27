import { Command } from 'commander';
import { startMcpServer } from '../../mcp/index.js';

export const mcpCommand = new Command('mcp')
    .description('Start MCP server for Claude Code integration')
    .action(async () => {
        await startMcpServer();
    });
