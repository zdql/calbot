#!/usr/bin/env node

import chalk from 'chalk';
import { Command } from 'commander';
import {
  displayEchoBanner,
  loginToEcho,
  logoutFromEcho,
  getEchoBalance,
  createEchoPaymentLink,
  useModel,
} from './cli-helpers.js';
import { main as agentLoop } from './agent-loop.js';
import { runInitialization } from './init.js';
import { logger } from './logger.js';

const program = new Command();

program
  .name('echo-example')
  .description('Example CLI tool for managing Echo applications')
  .version('1.0.0');

// Login command
program
  .command('login')
  .description('Authenticate with your Echo API key')
  .option('-k, --key <apiKey>', 'API key to save to .env file')
  .action(async options => {
    try {
      displayEchoBanner();
      await loginToEcho({ apiKey: options.key });
    } catch (error) {
      console.error(chalk.red('Login failed:'), error);
      process.exit(1);
    }
  });

// Logout command
program
  .command('logout')
  .description('Remove stored credentials')
  .action(async () => {
    try {
      await logoutFromEcho();
    } catch (error) {
      console.error(chalk.red('Logout failed:'), error);
      process.exit(1);
    }
  });

// Balance command
program
  .command('balance')
  .description('Check your account balance')
  .action(async () => {
    try {
      await getEchoBalance();
    } catch (error) {
      console.error(chalk.red('Failed to fetch balance:'), error);
      process.exit(1);
    }
  });

program
  .command('chat')
  .description('Chat with a language model, billed through Echo.')
  .argument('<message>', 'The message to send to the model')
  .action(async message => {
    await useModel(message, 'gpt-4o-mini');
  });

// Agent loop command
program
  .command('agent')
  .description('Start an interactive AI agent with bash and Google Calendar tools')
  .action(async () => {
    try {
      logger.header('Starting AI Agent Loop...');
      await agentLoop();
    } catch (error) {
      logger.error(`Agent loop failed: ${error}`);
      process.exit(1);
    }
  });

// Initialize coworker discovery command
program
  .command('init')
  .description('Discover coworkers from your Google Calendar events')
  .action(async () => {
    try {
      await runInitialization();
    } catch (error) {
      logger.error(`Initialization failed: ${error}`);
      process.exit(1);
    }
  });

// Generate payment link command
program
  .command('payment')
  .description('Generate a payment link to add credits')
  .option('-a, --amount <amount>', 'Amount in USD')
  .option('-d, --description <description>', 'Payment description')
  .action(async options => {
    try {
      const { amount, description } = options;
      const parsedAmount = amount ? parseFloat(amount) : undefined;
      await createEchoPaymentLink({
        ...(parsedAmount !== undefined && { amount: parsedAmount }),
        description,
        interactive: true,
      });
    } catch (error) {
      console.error(chalk.red('Failed to generate payment link:'), error);
      process.exit(1);
    }
  });

program.parse();
