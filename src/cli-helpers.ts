import chalk from 'chalk';
import inquirer from 'inquirer';
import open from 'open';
import { EchoClient } from '@zdql/echo-typescript-sdk';
import type {
  CreatePaymentLinkResponse,
  Balance,
} from '@zdql/echo-typescript-sdk';
import { OpenAI } from 'openai';
import { ECHO_APP_CONFIG } from './config.js';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
dotenv.config();

export interface LoginOptions {
  baseUrl?: string;
  silent?: boolean;
  apiKey?: string;
}

export interface PaymentOptions {
  amount?: number;
  description?: string;
  interactive?: boolean;
}

/**
 * Get an authenticated Echo client
 * @throws {Error} If no valid authentication is found
 */
export async function getAuthenticatedEchoClient(): Promise<EchoClient> {
  return new EchoClient({
    apiKey: process.env.ECHO_API_KEY ?? '',
    baseUrl: process.env.ECHO_BASE_URL || 'https://echo.merit.systems',
  });
}

/**
 * Authenticate with Echo and store API key
 * @param options - Login configuration options
 * @returns Promise that resolves when login is complete
 */
function writeApiKeyToEnv(apiKey: string): void {
  const envPath = path.join(process.cwd(), '.env');
  let envContent = '';

  // Read existing .env if it exists
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }

  // Check if ECHO_API_KEY already exists
  const lines = envContent.split('\n');
  let foundApiKey = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line && line.startsWith('ECHO_API_KEY=')) {
      lines[i] = `ECHO_API_KEY=${apiKey}`;
      foundApiKey = true;
      break;
    }
  }

  // If ECHO_API_KEY doesn't exist, add it
  if (!foundApiKey) {
    // Add a newline if file exists and doesn't end with one
    if (envContent && !envContent.endsWith('\n')) {
      lines.push('');
    }
    lines.push(`ECHO_API_KEY=${apiKey}`);
  }

  // Write back to .env
  fs.writeFileSync(envPath, lines.join('\n'));
}

export async function loginToEcho(options: LoginOptions = {}): Promise<void> {
  const {
    baseUrl = process.env.ECHO_BASE_URL || 'https://echo.merit.systems',
    silent = false,
    apiKey,
  } = options;

  // If API key is provided, write it to .env and skip browser flow
  if (apiKey) {
    try {
      writeApiKeyToEnv(apiKey);
      if (!silent) {
        console.log(chalk.green('✅ API key saved to .env file'));
        console.log(
          chalk.green(
            '🎉 Authentication complete! You can now use Echo features.'
          )
        );
      }
      return;
    } catch (error) {
      if (!silent) {
        console.log(
          chalk.red(
            '❌ Failed to save API key: ' +
              (error instanceof Error ? error.message : 'Unknown error')
          )
        );
      }
      throw error;
    }
  }

  if (!silent) {
    console.log(chalk.blue('🔐 Echo Authentication'));
    console.log();
  }

  const authUrl = `${baseUrl}/cli-auth?appId=${ECHO_APP_CONFIG.appId}`;

  if (!silent) {
    console.log(
      chalk.yellow('Opening Echo CLI authentication page in your browser...')
    );
    console.log(chalk.gray(`URL: ${authUrl}`));
    console.log();
  }

  // Open the browser
  try {
    await open(authUrl);
  } catch (error) {
    if (!silent) {
      console.log(
        chalk.yellow('Could not open browser automatically. Please visit:')
      );
      console.log(chalk.cyan(authUrl));
      console.log();
    }
  }

  if (!silent) {
    console.log(chalk.cyan('In the browser:'));
    console.log(chalk.cyan('1. Sign in to your Echo account if needed'));
    console.log(
      chalk.cyan('2. Select the Echo app you want to use with the CLI')
    );
    console.log(chalk.cyan('3. Generate a new app-scoped API key'));
    console.log(chalk.cyan('4. Copy the API key'));
    console.log();
  }

  // Wait for user to input their API key
  const answer = await inquirer.prompt([
    {
      type: 'input',
      name: 'apiKey',
      message: 'Paste your API key here:',
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return 'API key is required';
        }
        return true;
      },
    },
  ]);

  const userApiKey = answer.apiKey.trim();

  try {
    writeApiKeyToEnv(userApiKey);
    if (!silent) {
      console.log(chalk.green('✅ API key saved to .env file'));
      console.log(
        chalk.green(
          '🎉 Authentication complete! You can now use Echo features.'
        )
      );
    }
  } catch (error) {
    if (!silent) {
      console.log(
        chalk.red(
          '❌ Failed to save API key: ' +
            (error instanceof Error ? error.message : 'Unknown error')
        )
      );
    }
    throw error;
  }
}

/**
 * Remove stored Echo credentials
 * @param silent - Whether to suppress console output
 */
export async function logoutFromEcho(silent: boolean = false): Promise<void> {
  delete process.env.ECHO_API_KEY;
  if (!silent) {
    console.log(chalk.green('✅ Successfully logged out from Echo!'));
  }
}

/**
 * Get Echo account balance
 * @param silent - Whether to suppress console output
 * @returns Promise that resolves to balance information
 */
export async function getEchoBalance(
  silent: boolean = false
): Promise<Balance> {
  const client = await getAuthenticatedEchoClient();

  if (!silent) {
    console.log(chalk.blue('💰 Fetching your balance...'));
  }

  const balance = await client.getBalance();

  if (!silent) {
    console.log(chalk.green(`Balance: $${balance.balance.toFixed(2)}`));
    console.log(chalk.gray(`Total Credits: $${balance.totalPaid.toFixed(2)}`));
    console.log(chalk.gray(`Total Spent: $${balance.totalSpent.toFixed(2)}`));
  }

  return balance;
}

/**
 * Create an Echo payment link
 * @param options - Payment configuration options
 * @returns Promise that resolves to payment link response
 */
export async function createEchoPaymentLink(
  options: PaymentOptions = {}
): Promise<CreatePaymentLinkResponse> {
  const client = await getAuthenticatedEchoClient();

  let { amount, description, interactive = true } = options;

  if (!amount && interactive) {
    const answers = await inquirer.prompt([
      {
        type: 'number',
        name: 'amount',
        message: 'Enter the amount in USD:',
        validate: (input: number) =>
          input > 0 || 'Amount must be greater than 0',
      },
      {
        type: 'input',
        name: 'description',
        message: 'Enter payment description (optional):',
        default: 'Echo credits',
      },
    ]);
    amount = answers.amount;
    description = answers.description;
  }

  if (!amount) {
    throw new Error('Amount is required for payment link creation');
  }

  if (!description) {
    description = 'Echo credits';
  }

  if (interactive) {
    console.log(chalk.blue('💳 Generating payment link...'));
  }

  const response = await client.createPaymentLink({
    amount: parseFloat(amount.toString()),
    description,
  });

  if (interactive) {
    console.log(chalk.green('✅ Payment link generated successfully!'));
    console.log(chalk.blue(`🔗 Link: ${response.paymentLink.url}`));
    open(response.paymentLink.url); // open the payment link in the browser
  }

  return response;
}

export async function useModel(
  message: string,
  model: string = 'gpt-4o-mini'
): Promise<string> {
  const openai = new OpenAI({
    apiKey: process.env.ECHO_API_KEY,
    baseURL: 'https://echo.router.merit.systems/' + ECHO_APP_CONFIG.appId,
  });

  const response = await openai.chat.completions.create({
    model: model,
    messages: [{ role: 'user', content: message }],
  });

  console.log(response.choices[0]?.message?.content);
  return response.choices[0]?.message?.content ?? '';
}

/**
 * Display the Echo CLI banner
 */
export function displayEchoBanner(): void {
  console.log(
    chalk.cyan(
      '███████╗ ██████╗██╗  ██╗ ██████╗ \n' +
        '██╔════╝██╔════╝██║  ██║██╔═══██╗\n' +
        '█████╗  ██║     ███████║██║   ██║\n' +
        '██╔══╝  ██║     ██╔══██║██║   ██║\n' +
        '███████╗╚██████╗██║  ██║╚██████╔╝\n' +
        '╚══════╝ ╚═════╝╚═╝  ╚═╝ ╚═════╝'
    )
  );
  console.log(
    chalk.gray('Manage your Echo applications from the command line\n')
  );
}
