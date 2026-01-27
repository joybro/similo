#!/usr/bin/env node

import { Command } from 'commander';
import {
    searchCommand,
    addCommand,
    listCommand,
    removeCommand,
    serveCommand,
    statusCommand,
    stopCommand,
    clearCommand,
    mcpCommand
} from './commands/index.js';

const program = new Command();

program
    .name('similo')
    .description('Local semantic search for files and documents')
    .version('0.1.0');

program.addCommand(searchCommand);
program.addCommand(addCommand);
program.addCommand(listCommand);
program.addCommand(removeCommand);
program.addCommand(serveCommand);
program.addCommand(statusCommand);
program.addCommand(stopCommand);
program.addCommand(clearCommand);
program.addCommand(mcpCommand);

program.parse();
