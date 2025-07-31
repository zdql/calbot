import * as readline from 'readline';
import OpenAI from 'openai';
import { OAuth2Client } from 'google-auth-library';
import { allTools, handleToolCall, ToolCall } from './tools.js';
import { authorize, verifyAuth } from './google-tools.js';
import { logger } from './logger.js';
import { generateContextString } from './context.js';

async function userInput(): Promise<OpenAI.Chat.ChatCompletionMessageParam[]> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    logger.userPrompt();
    rl.on('line', (answer) => {
      rl.close();
      if (answer.toLowerCase() === 'exit' || answer.toLowerCase() === 'quit') {
        logger.info('Exiting agent loop. Goodbye!');
        process.exit(0);
      }
      resolve([{ role: 'user', content: answer }]);
    });
  });
}

class LLM {
  private client: OpenAI;
  private model: string;
  private messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  private systemPrompt: string;
  private tools: OpenAI.Chat.ChatCompletionTool[];

  constructor(model: string) {
    if (!process.env.ECHO_API_KEY) {
      throw new Error('ECHO_API_KEY environment variable not found.');
    }
    this.client = new OpenAI(
        {
            apiKey: process.env.ECHO_API_KEY,
            baseURL: 'https://echo.router.merit.systems'
        }
    );
    this.model = model;
    this.systemPrompt = `You are a helpful AI assistant with access to Google Calendar integration.
You can help the user by:
- Managing their Google Calendar (view, create, update, delete events)
- Finding free time slots and checking for scheduling conflicts
- Performing various calendar operations

⚠️  ABSOLUTELY CRITICAL DATETIME FORMAT REQUIREMENTS ⚠️
❌ FAILURE TO FOLLOW THESE RULES WILL RESULT IN TOOL FAILURES ❌

ALL datetime parameters MUST use EXACT ISO 8601 format: "YYYY-MM-DDTHH:MM:SS"
✅ CORRECT: "2024-01-15T14:30:00"
✅ CORRECT: "2024-12-25T09:00:00"
❌ WRONG: "January 15, 2024 2:30 PM"
❌ WRONG: "2024-01-15 14:30"
❌ WRONG: "14:30 today"
❌ WRONG: "tomorrow at 2pm"

NEVER use natural language for dates/times - ALWAYS convert to ISO 8601 format first!

Available tools:
- bash: Execute shell commands (be careful with destructive commands)
  • command (string): The shell command to execute

- get_events_in_time_range: View calendar events within a time range
  • maxResults (integer, 1-100, optional): Number of events to return
  • calendarId (string, optional): Calendar ID (default: "primary")
  • timeMin (string, optional): Start time in EXACT ISO 8601 format: "YYYY-MM-DDTHH:MM:SS"
  • timeMax (string, optional): End time in EXACT ISO 8601 format: "YYYY-MM-DDTHH:MM:SS"

- create_event: Create new calendar events with full details
  • title (string, required): Event title
  • startDateTime (string, required): Start time in EXACT ISO 8601 format: "YYYY-MM-DDTHH:MM:SS"
  • endDateTime (string, required): End time in EXACT ISO 8601 format: "YYYY-MM-DDTHH:MM:SS"
  • description (string, optional): Event description
  • location (string, optional): Event location
  • attendees (array of strings, optional): Email addresses
  • calendarId (string, optional): Calendar ID (default: "primary")

- create_quick_event: Quickly create events with minimal information
  • title (string, required): Event title
  • startDateTime (string, required): Start time in EXACT ISO 8601 format: "YYYY-MM-DDTHH:MM:SS"
  • durationMinutes (integer, optional): Duration in minutes (default: 60)
  • description (string, optional): Event description
  • location (string, optional): Event location
  • attendees (array of strings, optional): Email addresses

- update_event: Modify existing calendar events
  • eventId (string, required): The ID of the event to update
  • title (string, optional): Updated event title
  • startDateTime (string, optional): Updated start time in EXACT ISO 8601 format: "YYYY-MM-DDTHH:MM:SS"
  • endDateTime (string, optional): Updated end time in EXACT ISO 8601 format: "YYYY-MM-DDTHH:MM:SS"
  • description (string, optional): Updated event description
  • location (string, optional): Updated event location
  • attendees (array of strings, optional): Updated email addresses

- delete_event: Remove calendar events
  • eventId (string, required): The ID of the event to delete
  • calendarId (string, optional): Calendar ID (default: "primary")

- check_conflicts: Check for scheduling conflicts in a time range
  • startTime (string, required): Start time in EXACT ISO 8601 format: "YYYY-MM-DDTHH:MM:SS"
  • endTime (string, required): End time in EXACT ISO 8601 format: "YYYY-MM-DDTHH:MM:SS"
  • calendarId (string, optional): Calendar ID (default: "primary")

- find_free_time: Find available time slots for scheduling
  • startDate (string, required): Search start in EXACT ISO 8601 format: "YYYY-MM-DDTHH:MM:SS"
  • endDate (string, required): Search end in EXACT ISO 8601 format: "YYYY-MM-DDTHH:MM:SS"
  • slotDurationMinutes (integer, optional): Minimum slot duration (default: 60)
  • calendarId (string, optional): Calendar ID (default: "primary")

- get_calendars: List all available calendars
  • No parameters required

🚨 MANDATORY FORMATTING RULES - VIOLATIONS WILL CAUSE FAILURES 🚨
1. Email addresses: Must be valid format "user@domain.com"
2. Integers: Must be whole numbers, not strings
3. Arrays: Must be properly formatted ["email1@domain.com", "email2@domain.com"]
4. Event IDs: Are strings returned by other calendar operations

BEFORE calling ANY calendar tool with datetime parameters:
1. Convert ALL natural language dates/times to ISO 8601 format
2. Double-check the format matches exactly: "YYYY-MM-DDTHH:MM:SS"
3. Verify you have the correct year, month, day, hour, minute, second

If you encounter "Bad Request" errors, it's almost certainly because you used the wrong datetime format!

Be helpful, accurate, and always explain what you're doing before executing commands or making calendar changes.${generateContextString()}`;
    this.tools = allTools;
  }

  async call(content: OpenAI.Chat.ChatCompletionMessageParam[]): Promise<[string, ToolCall[]]> {
    this.messages.push(...content);

    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: this.systemPrompt },
        ...this.messages
      ],
      tools: this.tools,
      tool_choice: 'auto',
      stream: true
    });

    let outputText = '';
    const toolCalls: ToolCall[] = [];
    let currentToolCall: any = null;

    logger.agentLabel();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      
      if (delta?.content) {
        // Stream text content
        logger.streamChunk(delta.content);
        outputText += delta.content;
      }

      if (delta?.tool_calls) {
        for (const toolCallDelta of delta.tool_calls) {
          if (toolCallDelta.index !== undefined) {
            if (!currentToolCall || toolCallDelta.index !== currentToolCall.index) {
              if (currentToolCall) {
                // Finalize previous tool call
                try {
                  toolCalls.push({
                    id: currentToolCall.id,
                    name: currentToolCall.function.name,
                    input: JSON.parse(currentToolCall.function.arguments)
                  });
                } catch (e) {
                  logger.error(`Failed to parse tool call arguments: ${e}`);
                }
              }
              currentToolCall = {
                index: toolCallDelta.index,
                id: toolCallDelta.id || '',
                function: {
                  name: toolCallDelta.function?.name || '',
                  arguments: toolCallDelta.function?.arguments || ''
                }
              };
            } else {
              // Continue building current tool call
              if (toolCallDelta.id) {
                currentToolCall.id += toolCallDelta.id;
              }
              if (toolCallDelta.function?.name) {
                currentToolCall.function.name += toolCallDelta.function.name;
              }
              if (toolCallDelta.function?.arguments) {
                currentToolCall.function.arguments += toolCallDelta.function.arguments;
              }
            }
          }
        }
      }

      if (chunk.choices[0]?.finish_reason === 'stop' || chunk.choices[0]?.finish_reason === 'tool_calls') {
        break;
      }
    }

    // Finalize last tool call if any
    if (currentToolCall) {
      try {
        toolCalls.push({
          id: currentToolCall.id,
          name: currentToolCall.function.name,
          input: JSON.parse(currentToolCall.function.arguments)
        });
      } catch (e) {
        logger.error(`Failed to parse tool call arguments: ${e}`);
      }
    }

    logger.streamComplete();

    // Create assistant message for conversation history
    const assistantMessage: OpenAI.Chat.ChatCompletionMessage = {
      role: 'assistant',
      content: outputText || null,
      refusal: null,
      tool_calls: toolCalls.length > 0 ? toolCalls.map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.input)
        }
      })) : undefined
    };

    // Add assistant message to conversation history
    this.messages.push(assistantMessage);

    return [outputText, toolCalls];
  }
}

async function loop(llm: LLM, auth?: OAuth2Client): Promise<void> {
  let msg = await userInput();
  
  while (true) {
    const [output, toolCalls] = await llm.call(msg);
    
    if (toolCalls.length > 0) {
      logger.newLine();
      const toolResults = await Promise.all(
        toolCalls.map(async (tc) => {
          logger.toolStart(tc.name);
          const result = await handleToolCall(tc, auth);
          logger.toolComplete(tc.name);
          
          // Log the tool result in a readable format
          if (result.content && typeof result.content === 'string') {
            logger.toolResult(tc.name, result.content);
          }
          
          return result;
        })
      );
      msg = toolResults;
    } else {
      msg = await userInput();
    }
  }
}

export async function main(): Promise<void> {
  try {
    logger.banner('LLM Agent Loop with GPT and Calendar Tools');
    logger.info("Type 'exit' to end the conversation.");
    logger.newLine();
    
    let auth: OAuth2Client | undefined;
    
    logger.info('Initializing Google Calendar authentication...');
    try {
    const stopSpinner = logger.spinner('Connecting to Google Calendar...');
    auth = await authorize();
    const isValid = await verifyAuth(auth);
    stopSpinner();
    
    if (isValid) {
        logger.success('Google Calendar connected successfully!');
    } else {
        logger.warning('Google Calendar authentication verification failed');
        logger.info('Continuing with bash tools only...');
        auth = undefined;
    }
    } catch (error) {
    logger.error(`Google Calendar authentication failed: ${error instanceof Error ? error.message : String(error)}`);
    logger.info('Continuing with bash tools only...');
    }
    
    logger.newLine();
    await loop(new LLM('gpt-4o'), auth);
  } catch (error) {
    if (error instanceof Error && error.message.includes('SIGINT')) {
      logger.info('Exiting. Goodbye!');
    } else {
      logger.error(`An error occurred: ${error}`);
    }
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  process.on('SIGINT', () => {
    logger.info('\nExiting. Goodbye!');
    process.exit(0);
  });
  
  main().catch(logger.error);
}
