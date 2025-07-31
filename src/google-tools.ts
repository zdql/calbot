import { google, calendar_v3 } from 'googleapis';
import { authenticate } from '@google-cloud/local-auth';
import type { OAuth2Client } from 'google-auth-library';
import fs from 'fs/promises';
import path from 'path';

// Use Google's built-in types
export type CalendarEvent = calendar_v3.Schema$Event;
export type CalendarList = calendar_v3.Schema$CalendarList;
export type Calendar = calendar_v3.Schema$Calendar;

// Re-export useful Google types for convenience
export type EventsListParams = calendar_v3.Params$Resource$Events$List;
export type EventsInsertParams = calendar_v3.Params$Resource$Events$Insert;
export type EventsUpdateParams = calendar_v3.Params$Resource$Events$Update;
export type EventsDeleteParams = calendar_v3.Params$Resource$Events$Delete;

// Google Calendar API scopes
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events'
];

// Path to store credentials
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');
const TOKEN_PATH = path.join(process.cwd(), 'token.json');

/**
 * Load saved credentials if they exist
 */
async function loadSavedCredentials(): Promise<OAuth2Client | null> {
  try {
    const content = await fs.readFile(TOKEN_PATH, 'utf8');
    const credentials = JSON.parse(content);
    
    // First try to create OAuth2Client from fromJSON (original approach)
    const client = google.auth.fromJSON(credentials);
    if (client && 'setCredentials' in client) {
      // Ensure the credentials are properly set
      await (client as unknown as OAuth2Client).getAccessToken(); // This will refresh if needed
      return client as unknown as OAuth2Client;
    }
    
    return null;
  } catch (err) {
    console.log('Error loading saved credentials:', err);
    return null;
  }
}

/**
 * Save credentials for future use
 */
async function saveCredentials(client: OAuth2Client): Promise<void> {
  const content = await fs.readFile(CREDENTIALS_PATH, 'utf8');
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Verify if the auth client is properly authenticated
 */
export async function verifyAuth(auth: OAuth2Client): Promise<boolean> {
  try {
    await auth.getAccessToken();
    return true;
  } catch (error) {
    console.error('Auth verification failed:', error);
    return false;
  }
}

/**
 * Authorize and return authenticated Google Calendar client
 */
export async function authorize(): Promise<OAuth2Client> {
  let client = await loadSavedCredentials();
  if (client) {
    return client;
  }

  // Check if credentials file exists
  try {
    await fs.access(CREDENTIALS_PATH);
  } catch (error) {
    throw new Error(
      `Credentials file not found at ${CREDENTIALS_PATH}. ` +
      'Please download your OAuth2 credentials from Google Cloud Console and save them as credentials.json'
    );
  }

  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });

  if (client.credentials) {
    await saveCredentials(client);
  }

  return client;
}

/**
 * Get events from Google Calendar within a specified time range
 */
export async function getEventsInTimeRange(
  auth: OAuth2Client,
  options: Partial<EventsListParams> = {}
): Promise<CalendarEvent[]> {
  const calendar = google.calendar({ version: 'v3', auth: auth as any });
  
  const params: EventsListParams = {
    calendarId: 'primary',
    maxResults: 10,
    timeMin: new Date().toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    ...options,
  };

  try {
    const response = await calendar.events.list(params);
    return response.data.items || [];
  } catch (error) {
    // Don't log the full error details to console - let the tools handler format it properly
    throw error;
  }
}

/**
 * Create a new event in Google Calendar
 */
export async function createEvent(
  auth: OAuth2Client,
  event: CalendarEvent,
  options: Partial<EventsInsertParams> = {}
): Promise<CalendarEvent> {
  const calendar = google.calendar({ version: 'v3', auth: auth as any });
  
  const params: EventsInsertParams = {
    calendarId: 'primary',
    sendNotifications: true,
    sendUpdates: 'all',
    ...options,
    requestBody: event,
  };

  try {
    const response = await calendar.events.insert(params);
    return response.data;
  } catch (error) {
    throw new Error(`Failed to create event: ${error}`);
  }
}

/**
 * Update an existing event in Google Calendar
 */
export async function updateEvent(
  auth: OAuth2Client,
  eventId: string,
  event: Partial<CalendarEvent>,
  options: Partial<EventsUpdateParams> = {}
): Promise<CalendarEvent> {
  const calendar = google.calendar({ version: 'v3', auth: auth as any });
  
  const params: EventsUpdateParams = {
    calendarId: 'primary',
    sendNotifications: true,
    sendUpdates: 'all',
    ...options,
    eventId,
    requestBody: event,
  };

  try {
    const response = await calendar.events.update(params);
    return response.data;
  } catch (error) {
    throw new Error(`Failed to update event: ${error}`);
  }
}

/**
 * Delete an event from Google Calendar
 */
export async function deleteEvent(
  auth: OAuth2Client,
  eventId: string,
  options: Partial<EventsDeleteParams> = {}
): Promise<void> {
  const calendar = google.calendar({ version: 'v3', auth: auth as any });
  
  const params: EventsDeleteParams = {
    calendarId: 'primary',
    sendNotifications: true,
    ...options,
    eventId,
  };

  try {
    await calendar.events.delete(params);
  } catch (error) {
    throw new Error(`Failed to delete event: ${error}`);
  }
}

/**
 * Get a list of all calendars
 */
export async function getCalendars(
  auth: OAuth2Client,
  options: Partial<calendar_v3.Params$Resource$Calendarlist$List> = {}
): Promise<calendar_v3.Schema$CalendarListEntry[]> {
  const calendar = google.calendar({ version: 'v3', auth: auth as any });

  try {
    const response = await calendar.calendarList.list(options);
    return response.data.items || [];
  } catch (error) {
    throw new Error(`Failed to fetch calendars: ${error}`);
  }
}

/**
 * Check for scheduling conflicts
 */
export async function checkForConflicts(
  auth: OAuth2Client,
  startTime: string,
  endTime: string,
  calendarId: string = 'primary'
): Promise<CalendarEvent[]> {
  const conflicts = await getEventsInTimeRange(auth, {
    timeMin: startTime,
    timeMax: endTime,
    calendarId,
    maxResults: 100,
  });

  return conflicts.filter(event => {
    const eventStart = event.start?.dateTime || event.start?.date;
    const eventEnd = event.end?.dateTime || event.end?.date;
    
    if (!eventStart || !eventEnd) return false;
    
    const start = new Date(startTime);
    const end = new Date(endTime);
    const eStart = new Date(eventStart);
    const eEnd = new Date(eventEnd);
    
    // Check if there's any overlap
    return start < eEnd && end > eStart;
  });
}

/**
 * Create a quick event with minimal information
 */
export async function createQuickEvent(
  auth: OAuth2Client,
  title: string,
  startDateTime: string,
  durationMinutes: number = 60,
  options: { 
    description?: string; 
    location?: string; 
    calendarId?: string;
    attendees?: string[];
  } = {}
): Promise<CalendarEvent> {
  const startDate = new Date(startDateTime);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
  
  const event: CalendarEvent = {
    summary: title,
    description: options.description,
    location: options.location,
    start: {
      dateTime: startDate.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    end: {
      dateTime: endDate.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    attendees: options.attendees?.map(email => ({ email })),
  };

  return createEvent(auth, event, { calendarId: options.calendarId });
}

/**
 * Find free time slots in a given date range
 */
export async function findFreeTimeSlots(
  auth: OAuth2Client,
  startDate: string,
  endDate: string,
  slotDurationMinutes: number = 60,
  calendarId: string = 'primary'
): Promise<Array<{ start: string; end: string }>> {
  const events = await getEventsInTimeRange(auth, {
    timeMin: startDate,
    timeMax: endDate,
    calendarId,
    maxResults: 100,
  });

  const busySlots = events
    .filter(event => event.start?.dateTime && event.end?.dateTime)
    .map(event => ({
      start: new Date(event.start!.dateTime!),
      end: new Date(event.end!.dateTime!),
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const freeSlots: Array<{ start: string; end: string }> = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  const slotDuration = slotDurationMinutes * 60000; // Convert to milliseconds

  let currentTime = new Date(start);

  for (const busySlot of busySlots) {
    // Check if there's a free slot before the busy slot
    if (currentTime < busySlot.start) {
      const freeEnd = new Date(Math.min(busySlot.start.getTime(), end.getTime()));
      if (freeEnd.getTime() - currentTime.getTime() >= slotDuration) {
        freeSlots.push({
          start: currentTime.toISOString(),
          end: freeEnd.toISOString(),
        });
      }
    }
    currentTime = new Date(Math.max(currentTime.getTime(), busySlot.end.getTime()));
  }

  // Check for free time after the last busy slot
  if (currentTime < end) {
    if (end.getTime() - currentTime.getTime() >= slotDuration) {
      freeSlots.push({
        start: currentTime.toISOString(),
        end: end.toISOString(),
      });
    }
  }

  return freeSlots;
}
