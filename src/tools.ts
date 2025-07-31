import OpenAI from 'openai';
import { OAuth2Client } from 'google-auth-library';
import * as googleTools from './google-tools.js';
import { spawn } from 'child_process';
import { logger } from './logger.js';
import { normalizeDateTime, createGoogleDateTime } from './date-format.js';

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, any>;
}

// Google Calendar tools
const getEventsInTimeRangeTool: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'get_events_in_time_range',
    description: 'Get events from Google Calendar within a specified time range. Can search both upcoming events and historical events. Useful for checking schedule, viewing appointments, and seeing what\'s planned or what happened.',
    parameters: {
      type: 'object',
      properties: {
        maxResults: {
          type: 'integer',
          description: 'Maximum number of events to return (default: 10)',
          minimum: 1,
          maximum: 100
        },
        calendarId: {
          type: 'string',
          description: 'Calendar ID to query (default: "primary" for main calendar)'
        },
        timeMin: {
          type: 'string',
          description: 'Lower bound (inclusive) for event start time (accepts various formats: ISO 8601, "today", "tomorrow", "1/15/2024", "in 2 hours", etc., default: now)'
        },
        timeMax: {
          type: 'string',
          description: 'Upper bound (exclusive) for event end time (accepts various formats: ISO 8601, "today", "tomorrow", "1/15/2024", "in 2 hours", etc.)'
        }
      },
      required: []
    }
  }
};

const createEventTool: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'create_event',
    description: 'Create a new event in Google Calendar. Use this to schedule meetings, appointments, or any calendar events.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Event title/summary'
        },
        startDateTime: {
          type: 'string',
          description: 'Event start date and time in ISO 8601 format (e.g., "2024-01-15T14:30:00")'
        },
        endDateTime: {
          type: 'string',
          description: 'Event end date and time in ISO 8601 format'
        },
        description: {
          type: 'string',
          description: 'Event description (optional)'
        },
        location: {
          type: 'string',
          description: 'Event location (optional)'
        },
        attendees: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of attendee email addresses (optional)'
        },
        calendarId: {
          type: 'string',
          description: 'Calendar ID where to create the event (default: "primary")'
        }
      },
      required: ['title', 'startDateTime', 'endDateTime']
    }
  }
};

const createQuickEventTool: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'create_quick_event',
    description: 'Create a quick event with minimal information. Automatically calculates end time based on duration.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Event title/summary'
        },
        startDateTime: {
          type: 'string',
          description: 'Event start date and time in ISO 8601 format'
        },
        durationMinutes: {
          type: 'integer',
          description: 'Duration of the event in minutes (default: 60)',
          minimum: 1
        },
        description: {
          type: 'string',
          description: 'Event description (optional)'
        },
        location: {
          type: 'string',
          description: 'Event location (optional)'
        },
        attendees: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of attendee email addresses (optional)'
        }
      },
      required: ['title', 'startDateTime']
    }
  }
};

const updateEventTool: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'update_event',
    description: 'Update an existing event in Google Calendar. Use this to modify event details, reschedule, or change attendees.',
    parameters: {
      type: 'object',
      properties: {
        eventId: {
          type: 'string',
          description: 'The ID of the event to update'
        },
        title: {
          type: 'string',
          description: 'Updated event title/summary (optional)'
        },
        startDateTime: {
          type: 'string',
          description: 'Updated start date and time in ISO 8601 format (optional)'
        },
        endDateTime: {
          type: 'string',
          description: 'Updated end date and time in ISO 8601 format (optional)'
        },
        description: {
          type: 'string',
          description: 'Updated event description (optional)'
        },
        location: {
          type: 'string',
          description: 'Updated event location (optional)'
        },
        attendees: {
          type: 'array',
          items: { type: 'string' },
          description: 'Updated list of attendee email addresses (optional)'
        }
      },
      required: ['eventId']
    }
  }
};

const deleteEventTool: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'delete_event',
    description: 'Delete an event from Google Calendar. Use this to cancel meetings or remove events.',
    parameters: {
      type: 'object',
      properties: {
        eventId: {
          type: 'string',
          description: 'The ID of the event to delete'
        },
        calendarId: {
          type: 'string',
          description: 'Calendar ID where the event exists (default: "primary")'
        }
      },
      required: ['eventId']
    }
  }
};

const checkConflictsTool: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'check_conflicts',
    description: 'Check for scheduling conflicts in a given time range. Useful before scheduling new events.',
    parameters: {
      type: 'object',
      properties: {
        startTime: {
          type: 'string',
          description: 'Start time to check in ISO 8601 format'
        },
        endTime: {
          type: 'string',
          description: 'End time to check in ISO 8601 format'
        },
        calendarId: {
          type: 'string',
          description: 'Calendar ID to check (default: "primary")'
        }
      },
      required: ['startTime', 'endTime']
    }
  }
};

const findFreeTimeTool: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'find_free_time',
    description: 'Find available time slots in a given date range. Perfect for finding when to schedule new meetings.',
    parameters: {
      type: 'object',
      properties: {
        startDate: {
          type: 'string',
          description: 'Start of the search range in ISO 8601 format'
        },
        endDate: {
          type: 'string',
          description: 'End of the search range in ISO 8601 format'
        },
        slotDurationMinutes: {
          type: 'integer',
          description: 'Minimum duration for free slots in minutes (default: 60)',
          minimum: 1
        },
        calendarId: {
          type: 'string',
          description: 'Calendar ID to search (default: "primary")'
        }
      },
      required: ['startDate', 'endDate']
    }
  }
};

const getCalendarsTool: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'get_calendars',
    description: 'Get a list of all available calendars. Useful for finding calendar IDs or seeing what calendars are available.',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  }
};

// Export all tools
export const allTools: OpenAI.Chat.ChatCompletionTool[] = [
  getEventsInTimeRangeTool,
  createEventTool,
  createQuickEventTool,
  updateEventTool,
  deleteEventTool,
  checkConflictsTool,
  findFreeTimeTool,
  getCalendarsTool
];

// Function to execute bash commands
async function executeBash(command: string): Promise<string> {
  return new Promise((resolve) => {
    const process = spawn('bash', ['-c', command]);
    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    const timeout = setTimeout(() => {
      process.kill();
      resolve('Error executing command: Command timed out after 10 seconds');
    }, 10000);

    process.on('close', (code) => {
      clearTimeout(timeout);
      resolve(`STDOUT:\n${stdout}\nSTDERR:\n${stderr}\nEXIT CODE: ${code}`);
    });

    process.on('error', (error) => {
      clearTimeout(timeout);
      resolve(`Error executing command: ${error.message}`);
    });
  });
}

// Helper function to format calendar events with styling
function formatCalendarEvents(events: any[]): string {
  if (!events || events.length === 0) {
    return 'No events found in the specified time range.';
  }

  const formattedEvents = events.map((event, index) => {
    const eventString = logger.formatCalendarEvent(event);
    return `${index + 1}. ${eventString}`;
  });

  return formattedEvents.join('\n\n');
}

// Helper function to format single calendar event
function formatSingleCalendarEvent(event: any): string {
  return logger.formatCalendarEvent(event);
}

// Input validation helper (replaced by date-format.ts normalizeDateTime function)

function validateInteger(value: any, paramName: string, min?: number, max?: number): void {
  if (value !== undefined && value !== null) {
    if (!Number.isInteger(value)) {
      throw new Error(`${paramName} must be an integer. Received: ${typeof value} "${value}"`);
    }
    if (min !== undefined && value < min) {
      throw new Error(`${paramName} must be at least ${min}. Received: ${value}`);
    }
    if (max !== undefined && value > max) {
      throw new Error(`${paramName} must be at most ${max}. Received: ${value}`);
    }
  }
}

function validateString(value: any, paramName: string): void {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    throw new Error(`${paramName} must be a string. Received: ${typeof value} "${value}"`);
  }
}

function validateEmailArray(emails: any, paramName: string): void {
  if (emails !== undefined && emails !== null) {
    if (!Array.isArray(emails)) {
      throw new Error(`${paramName} must be an array of email addresses. Received: ${typeof emails}`);
    }
    for (let i = 0; i < emails.length; i++) {
      if (typeof emails[i] !== 'string') {
        throw new Error(`${paramName}[${i}] must be a string email address. Received: ${typeof emails[i]} "${emails[i]}"`);
      }
      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emails[i])) {
        throw new Error(`${paramName}[${i}] must be a valid email address. Received: "${emails[i]}"`);
      }
    }
  }
}

// Helper to format Google API errors into actionable messages
function formatGoogleApiError(error: any): string {
  // Try multiple paths to find error details
  const errorDetails = error?.cause || error?.response?.data?.error || error?.response?.data || error;
  
  // Extract error message from various possible locations
  let message = errorDetails?.message || errorDetails?.error_description || 'Unknown error';
  let code = errorDetails?.code || errorDetails?.status || error?.code || error?.status;
  
  // Handle Google API specific error structures
  if (errorDetails?.errors && Array.isArray(errorDetails.errors) && errorDetails.errors.length > 0) {
    message = errorDetails.errors[0].message || message;
    if (errorDetails.errors[0].reason) {
      // Common Google API error reasons
      switch (errorDetails.errors[0].reason) {
        case 'invalid':
          return 'Invalid parameter value. Please check your date format (use ISO 8601 like "2024-01-15T14:30:00") and other parameters';
        case 'badRequest':
          return 'Bad request. Please check your date/time format (use ISO 8601 like "2024-01-15T14:30:00") and parameter types';
        case 'notFound':
          return 'Resource not found. The calendar or event may not exist or may have been deleted';
        case 'forbidden':
          return 'Access denied. You may not have permission to access this calendar';
        case 'unauthorized':
          return 'Authentication failed. Please re-authenticate with Google Calendar';
      }
    }
  }
  
  if (code === 400) {
    if (message?.toLowerCase().includes('time') || message?.toLowerCase().includes('date')) {
      return 'Invalid date/time format. Please use ISO 8601 format like "2024-01-15T14:30:00" or "2024-01-15T14:30:00Z"';
    }
    if (message?.toLowerCase().includes('calendar')) {
      return 'Invalid calendar ID. Use "primary" for your main calendar or get valid IDs with get_calendars';
    }
    if (message?.toLowerCase().includes('event')) {
      return 'Invalid event ID. Get valid event IDs from get_events_in_time_range';
    }
    return `Bad request: ${message}. Please check your parameters (especially date formats - use ISO 8601 like "2024-01-15T14:30:00")`;
  }
  
  if (code === 401) {
    return 'Authentication failed. Please re-authenticate with Google Calendar';
  }
  
  if (code === 403) {
    return 'Permission denied. Check that you have calendar access permissions';
  }
  
  if (code === 404) {
    return 'Resource not found. The calendar or event may have been deleted';
  }
  
  return `Google Calendar API error (${code || 'unknown'}): ${message}`;
}

// Tool execution handler with context awareness
export async function handleToolCall(
  toolCall: ToolCall, 
  auth?: OAuth2Client,
): Promise<OpenAI.Chat.ChatCompletionMessageParam> {
  try {
    let result: string;

    switch (toolCall.name) {
      case 'bash':
        result = await executeBash(toolCall.input.command);
        break;

      case 'get_events_in_time_range':
        if (!auth) throw new Error('Google Calendar authentication required');
        
        // Validate input parameters
        validateInteger(toolCall.input.maxResults, 'maxResults', 1, 100);
        validateString(toolCall.input.calendarId, 'calendarId');
        
        // Normalize date formats for Google Calendar API
        const normalizedInput = { ...toolCall.input };
        if (toolCall.input.timeMin) {
          normalizedInput.timeMin = normalizeDateTime(toolCall.input.timeMin, 'timeMin');
        }
        if (toolCall.input.timeMax) {
          normalizedInput.timeMax = normalizeDateTime(toolCall.input.timeMax, 'timeMax');
        }
        
        const events = await googleTools.getEventsInTimeRange(auth, normalizedInput);
        // Return formatted string for CLI context
        result = formatCalendarEvents(events);

        break;

      case 'create_event':
        if (!auth) throw new Error('Google Calendar authentication required');
        const { title, startDateTime, endDateTime, description, location, attendees, calendarId } = toolCall.input;
        
        // Validate required parameters
        validateString(title, 'title');
        if (!title) throw new Error('title is required and cannot be empty');
        
        // Normalize date formats for Google Calendar API
        const normalizedStartDateTime = normalizeDateTime(startDateTime, 'startDateTime');
        const normalizedEndDateTime = normalizeDateTime(endDateTime, 'endDateTime');
        
        // Validate optional parameters
        validateString(description, 'description');
        validateString(location, 'location');
        validateString(calendarId, 'calendarId');
        validateEmailArray(attendees, 'attendees');
        
        // Validate start is before end
        if (new Date(normalizedStartDateTime) >= new Date(normalizedEndDateTime)) {
          throw new Error('startDateTime must be before endDateTime');
        }
        
        const startGoogleDateTime = createGoogleDateTime(startDateTime);
        const endGoogleDateTime = createGoogleDateTime(endDateTime);
        
        const event: googleTools.CalendarEvent = {
          summary: title,
          description,
          location,
          start: startGoogleDateTime,
          end: endGoogleDateTime,
          attendees: attendees?.map((email: string) => ({ email })),
        };
        const createdEvent = await googleTools.createEvent(auth, event, { calendarId });
        result = `Event created successfully!\n\n${formatSingleCalendarEvent(createdEvent)}`;
        break;

      case 'create_quick_event':
        if (!auth) throw new Error('Google Calendar authentication required');
        
        // Validate required parameters
        validateString(toolCall.input.title, 'title');
        if (!toolCall.input.title) throw new Error('title is required and cannot be empty');
        
        // Normalize date format for Google Calendar API
        const normalizedQuickStartDateTime = normalizeDateTime(toolCall.input.startDateTime, 'startDateTime');
        
        // Validate optional parameters
        validateInteger(toolCall.input.durationMinutes, 'durationMinutes', 1);
        validateString(toolCall.input.description, 'description');
        validateString(toolCall.input.location, 'location');
        validateString(toolCall.input.calendarId, 'calendarId');
        validateEmailArray(toolCall.input.attendees, 'attendees');
        
        const quickEvent = await googleTools.createQuickEvent(
          auth,
          toolCall.input.title,
          normalizedQuickStartDateTime,
          toolCall.input.durationMinutes || 60,
          {
            description: toolCall.input.description,
            location: toolCall.input.location,
            attendees: toolCall.input.attendees,
            calendarId: toolCall.input.calendarId
          }
        );
        result = `Quick event created successfully!\n\n${formatSingleCalendarEvent(quickEvent)}`;
        break;

      case 'update_event':
        if (!auth) throw new Error('Google Calendar authentication required');
        const { eventId, ...updateData } = toolCall.input;
        
        // Validate required parameters
        validateString(eventId, 'eventId');
        if (!eventId) throw new Error('eventId is required and cannot be empty');
        
        // Normalize date formats for Google Calendar API
        let normalizedUpdateStartDateTime: string | undefined;
        let normalizedUpdateEndDateTime: string | undefined;
        
        if (updateData.startDateTime) {
          normalizedUpdateStartDateTime = normalizeDateTime(updateData.startDateTime, 'startDateTime');
        }
        if (updateData.endDateTime) {
          normalizedUpdateEndDateTime = normalizeDateTime(updateData.endDateTime, 'endDateTime');
        }
        
        // Validate optional parameters
        validateString(updateData.title, 'title');
        validateString(updateData.description, 'description');
        validateString(updateData.location, 'location');
        validateEmailArray(updateData.attendees, 'attendees');
        
        // Validate start is before end if both are provided
        if (normalizedUpdateStartDateTime && normalizedUpdateEndDateTime && 
            new Date(normalizedUpdateStartDateTime) >= new Date(normalizedUpdateEndDateTime)) {
          throw new Error('startDateTime must be before endDateTime');
        }
        
        const eventUpdate: Partial<googleTools.CalendarEvent> = {};
        if (updateData.title) eventUpdate.summary = updateData.title;
        if (updateData.description) eventUpdate.description = updateData.description;
        if (updateData.location) eventUpdate.location = updateData.location;
        if (updateData.startDateTime) {
          eventUpdate.start = createGoogleDateTime(updateData.startDateTime);
        }
        if (updateData.endDateTime) {
          eventUpdate.end = createGoogleDateTime(updateData.endDateTime);
        }
        if (updateData.attendees) {
          eventUpdate.attendees = updateData.attendees.map((email: string) => ({ email }));
        }
        const updatedEvent = await googleTools.updateEvent(auth, eventId, eventUpdate);
        result = `Event updated successfully!\n\n${formatSingleCalendarEvent(updatedEvent)}`;
        break;

      case 'delete_event':
        if (!auth) throw new Error('Google Calendar authentication required');
        
        // Validate required parameters
        validateString(toolCall.input.eventId, 'eventId');
        if (!toolCall.input.eventId) throw new Error('eventId is required and cannot be empty');
        validateString(toolCall.input.calendarId, 'calendarId');
        
        await googleTools.deleteEvent(auth, toolCall.input.eventId, {
          calendarId: toolCall.input.calendarId
        });
        result = 'Event deleted successfully!';
        break;

      case 'check_conflicts':
        if (!auth) throw new Error('Google Calendar authentication required');
        
        // Normalize date formats for Google Calendar API
        const normalizedConflictStartTime = normalizeDateTime(toolCall.input.startTime, 'startTime');
        const normalizedConflictEndTime = normalizeDateTime(toolCall.input.endTime, 'endTime');
        
        // Validate optional parameters
        validateString(toolCall.input.calendarId, 'calendarId');
        
        // Validate start is before end
        if (new Date(normalizedConflictStartTime) >= new Date(normalizedConflictEndTime)) {
          throw new Error('startTime must be before endTime');
        }
        
        const conflicts = await googleTools.checkForConflicts(
          auth,
          normalizedConflictStartTime,
          normalizedConflictEndTime,
          toolCall.input.calendarId
        );
        result = conflicts.length > 0 
          ? `Found ${conflicts.length} conflicts:\n\n${formatCalendarEvents(conflicts)}`
          : 'No conflicts found in the specified time range.';
        break;

      case 'find_free_time':
        if (!auth) throw new Error('Google Calendar authentication required');
        
        // Normalize date formats for Google Calendar API
        const normalizedFreeStartDate = normalizeDateTime(toolCall.input.startDate, 'startDate');
        const normalizedFreeEndDate = normalizeDateTime(toolCall.input.endDate, 'endDate');
        
        // Validate optional parameters
        validateInteger(toolCall.input.slotDurationMinutes, 'slotDurationMinutes', 1);
        validateString(toolCall.input.calendarId, 'calendarId');
        
        // Validate start is before end
        if (new Date(normalizedFreeStartDate) >= new Date(normalizedFreeEndDate)) {
          throw new Error('startDate must be before endDate');
        }
        
        const freeSlots = await googleTools.findFreeTimeSlots(
          auth,
          normalizedFreeStartDate,
          normalizedFreeEndDate,
          toolCall.input.slotDurationMinutes,
          toolCall.input.calendarId
        );
        if (freeSlots.length > 0) {
          const formattedSlots = freeSlots.map((slot: any, index: number) => {
            const start = new Date(slot.start).toLocaleString();
            const end = new Date(slot.end).toLocaleString();
            return `${index + 1}. 🕒 ${start} - ${end}`;
          }).join('\n');
          result = `Found ${freeSlots.length} free time slots:\n\n${formattedSlots}`;
        } else {
          result = 'No free time slots found in the specified range.';
        }
        break;

      case 'get_calendars':
        if (!auth) throw new Error('Google Calendar authentication required');
        const calendars = await googleTools.getCalendars(auth);
        const formattedCalendars = calendars.map((cal: any, index: number) => {
          return `${index + 1}. 📅 ${cal.summary || 'Untitled Calendar'}\n   🆔 ID: ${cal.id}\n   📝 ${cal.description || 'No description'}`;
        }).join('\n\n');
        result = `Available calendars:\n\n${formattedCalendars}`;
        break;

      default:
        throw new Error(`Unsupported tool: ${toolCall.name}`);
    }

    return {
      role: 'tool',
      tool_call_id: toolCall.id,
      content: result
    };

  } catch (error) {
    let errorMsg: string;
    
    // Check if it's a Google API error by looking for common Google API error patterns
    const isGoogleApiError = error && typeof error === 'object' && (
      'code' in error || 
      'response' in error || 
      'cause' in error ||
      (error as any).constructor?.name === 'GaxiosError' ||
      ((error as any).message && (error as any).message.includes('googleapis'))
    );
    
    if (isGoogleApiError) {
      // Temporary debug log to understand error structure
      const errorObj = error as any;
      console.log('DEBUG - Google API Error structure:', JSON.stringify({
        constructor: errorObj.constructor?.name,
        code: errorObj.code,
        status: errorObj.status,
        message: errorObj.message,
        cause: errorObj.cause,
        response: errorObj.response ? {
          status: errorObj.response.status,
          statusText: errorObj.response.statusText,
          data: errorObj.response.data
        } : undefined
      }, null, 2));
      
      errorMsg = `Error executing ${toolCall.name}: ${formatGoogleApiError(error)}`;
    } else {
      errorMsg = `Error executing ${toolCall.name}: ${error instanceof Error ? error.message : String(error)}`;
    }
    
    return {
      role: 'tool',
      tool_call_id: toolCall.id,
      content: errorMsg
    };
  }
}