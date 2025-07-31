/**
 * Date formatting utilities for Google Calendar API
 * 
 * Google Calendar API expects ISO 8601 format for dateTime fields:
 * - Format: YYYY-MM-DDTHH:mm:ss.sssZ or YYYY-MM-DDTHH:mm:ss with timezone
 * - Examples: "2024-01-15T14:30:00Z", "2024-01-15T14:30:00"
 */

export interface GoogleCalendarDateTime {
  dateTime: string;
  timeZone: string;
}

/**
 * Convert various JavaScript date formats to Google Calendar API format
 * Accepts: Date objects, ISO strings, timestamps, date strings
 */
export function formatDateTimeForGoogle(input: string | number | Date, timeZone?: string): GoogleCalendarDateTime {
  if (!input) {
    throw new Error('Date input is required');
  }

  let date: Date;
  
  try {
    // Handle different input types
    if (input instanceof Date) {
      date = input;
    } else if (typeof input === 'number') {
      // Unix timestamp (milliseconds)
      date = new Date(input);
    } else if (typeof input === 'string') {
      // Handle various string formats
      date = parseStringDate(input);
    } else {
      throw new Error(`Unsupported date type: ${typeof input}`);
    }

    // Validate the resulting date
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date: ${input}`);
    }

    // Format to ISO string and ensure timezone
    const dateTimeString = date.toISOString();
    const resolvedTimeZone = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;

    return {
      dateTime: dateTimeString,
      timeZone: resolvedTimeZone
    };

  } catch (error) {
    throw new Error(`Failed to format date "${input}": ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Parse various string date formats into a Date object
 */
function parseStringDate(dateStr: string): Date {
  // Trim whitespace
  const trimmed = dateStr.trim();
  
  // If already in ISO format, use directly
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?([+-]\d{2}:\d{2}|Z)?$/;
  if (isoRegex.test(trimmed)) {
    return new Date(trimmed);
  }

  // Try parsing common formats
  const formats = [
    // ISO date without time
    /^\d{4}-\d{2}-\d{2}$/,
    // US format: MM/DD/YYYY or MM-DD-YYYY
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/,
    // US format with time: MM/DD/YYYY HH:mm or MM/DD/YYYY HH:mm:ss
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i,
    // European format: DD/MM/YYYY or DD-MM-YYYY
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/,
    // Natural language patterns
    /^(today|tomorrow|yesterday)$/i,
    // Relative dates: "in 2 hours", "next week", etc.
    /^(in|next|this)\s+/i
  ];

  // Handle natural language dates
  if (/^today$/i.test(trimmed)) {
    return new Date();
  }
  
  if (/^tomorrow$/i.test(trimmed)) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }
  
  if (/^yesterday$/i.test(trimmed)) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday;
  }

  // Handle relative time patterns
  const relativeMatch = trimmed.match(/^in\s+(\d+)\s+(minute|minutes|hour|hours|day|days|week|weeks)$/i);
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1]);
    const unit = relativeMatch[2].toLowerCase();
    const now = new Date();
    
    switch (unit) {
      case 'minute':
      case 'minutes':
        now.setMinutes(now.getMinutes() + amount);
        break;
      case 'hour':
      case 'hours':
        now.setHours(now.getHours() + amount);
        break;
      case 'day':
      case 'days':
        now.setDate(now.getDate() + amount);
        break;
      case 'week':
      case 'weeks':
        now.setDate(now.getDate() + (amount * 7));
        break;
    }
    return now;
  }

  // Try US date format: MM/DD/YYYY with optional time
  const usDateMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?)?$/i);
  if (usDateMatch) {
    const month = parseInt(usDateMatch[1]) - 1; // Month is 0-indexed
    const day = parseInt(usDateMatch[2]);
    const year = parseInt(usDateMatch[3]);
    let hour = parseInt(usDateMatch[4] || '0');
    const minute = parseInt(usDateMatch[5] || '0');
    const second = parseInt(usDateMatch[6] || '0');
    const ampm = usDateMatch[7];

    // Handle AM/PM
    if (ampm) {
      if (ampm.toUpperCase() === 'PM' && hour !== 12) {
        hour += 12;
      } else if (ampm.toUpperCase() === 'AM' && hour === 12) {
        hour = 0;
      }
    }

    return new Date(year, month, day, hour, minute, second);
  }

  // Try ISO date without time (add default time)
  const isoDateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateMatch) {
    return new Date(`${trimmed}T00:00:00`);
  }

  // Fallback to native Date parsing
  const fallback = new Date(trimmed);
  if (!isNaN(fallback.getTime())) {
    return fallback;
  }

  throw new Error(`Unable to parse date format: "${dateStr}"`);
}

/**
 * Validate and normalize a date string for Google Calendar API
 * This is the main function to use in tool calls
 */
export function normalizeDateTime(input: string | number | Date, paramName: string, timeZone?: string): string {
  try {
    const formatted = formatDateTimeForGoogle(input, timeZone);
    return formatted.dateTime;
  } catch (error) {
    throw new Error(`${paramName}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Create a Google Calendar date-time object with timezone
 */
export function createGoogleDateTime(input: string | number | Date, timeZone?: string): GoogleCalendarDateTime {
  return formatDateTimeForGoogle(input, timeZone);
}

/**
 * Validate that a string is already in proper Google Calendar format
 */
export function isValidGoogleDateTimeFormat(dateTime: string): boolean {
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?([+-]\d{2}:\d{2}|Z)?$/;
  if (!isoRegex.test(dateTime)) {
    return false;
  }
  
  const date = new Date(dateTime);
  return !isNaN(date.getTime());
}