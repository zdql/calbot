/**
 * Initialization script that discovers coworkers from calendar events
 * and saves them to a configuration file
 */

import { OAuth2Client } from 'google-auth-library';
import { authorize, verifyAuth, getEventsInTimeRange, CalendarEvent } from './google-tools.js';
import { logger } from './logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';

interface CoworkerInfo {
  name: string;
  email: string;
  role?: string;
  firstMet?: string;
  meetingCount?: number;
}

interface CoworkerConfig {
  lastUpdated: string;
  coworkers: CoworkerInfo[];
}

class CoworkerDiscovery {
  private discoveredCoworkers: Map<string, CoworkerInfo> = new Map();

  constructor() {
    // No AI agent initialization needed
  }

  private extractCoworkersFromEvents(events: CalendarEvent[]): CoworkerInfo[] {
    for (const event of events) {
      if (event.attendees) {
        for (const attendee of event.attendees) {
          const email = attendee.email;
          if (!email) continue;
          
          const name = attendee.displayName || email.split('@')[0];
          
          // Skip the user's own email and obvious system emails
          if (email.includes('calendar.google.com') || 
              email.includes('noreply') || 
              email.includes('no-reply')) {
            continue;
          }
          
          if (this.discoveredCoworkers.has(email)) {
            const existing = this.discoveredCoworkers.get(email)!;
            existing.meetingCount = (existing.meetingCount || 0) + 1;
          } else {
            const role = this.inferRoleFromEvent(event, email);
            this.discoveredCoworkers.set(email, {
              name: name,
              email: email,
              role: role,
              firstMet: event.start?.dateTime || event.start?.date || undefined,
              meetingCount: 1
            });
          }
        }
      }
    }
    
    return Array.from(this.discoveredCoworkers.values());
  }

  private inferRoleFromEvent(event: CalendarEvent, email: string): string | undefined {
    const summary = (event.summary || '').toLowerCase();
    const description = (event.description || '').toLowerCase();
    const text = `${summary} ${description}`;
    
    // Simple role inference based on meeting patterns
    if (text.includes('engineering') || text.includes('dev') || text.includes('code')) {
      return 'Engineer';
    } else if (text.includes('product') || text.includes('pm')) {
      return 'Product Manager';
    } else if (text.includes('design') || text.includes('ux') || text.includes('ui')) {
      return 'Designer';
    } else if (text.includes('marketing') || text.includes('growth')) {
      return 'Marketing';
    } else if (text.includes('sales') || text.includes('account')) {
      return 'Sales';
    } else if (text.includes('hr') || text.includes('people')) {
      return 'HR';
    }
    
    return undefined;
  }

  async discoverCoworkersFromCalendar(auth: OAuth2Client): Promise<void> {
    logger.info('Searching calendar events from the last month...');
    
    // Get events from the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const timeMin = thirtyDaysAgo.toISOString();
    const timeMax = new Date().toISOString();
    
    try {
      // Get events in batches to ensure we get comprehensive coverage
      const allEvents: CalendarEvent[] = [];
      
      // First batch: last 30 days
      const events1 = await getEventsInTimeRange(auth, {
        timeMin,
        timeMax,
        maxResults: 100,
        singleEvents: true,
        orderBy: 'startTime'
      });
      allEvents.push(...events1);
      
      // Second batch: last 60 days (for better coverage)
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      
      const events2 = await getEventsInTimeRange(auth, {
        timeMin: sixtyDaysAgo.toISOString(),
        timeMax: thirtyDaysAgo.toISOString(),
        maxResults: 50,
        singleEvents: true,
        orderBy: 'startTime'
      });
      allEvents.push(...events2);
      
      logger.info(`Found ${allEvents.length} total calendar events to analyze`);
      
      // Extract coworkers from all events
      this.extractCoworkersFromEvents(allEvents);
      
      logger.info(`Discovered ${this.discoveredCoworkers.size} unique potential coworkers`);
      
    } catch (error) {
      logger.error(`Failed to fetch calendar events: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  getDiscoveredCoworkers(): CoworkerInfo[] {
    return Array.from(this.discoveredCoworkers.values())
      .filter(c => c.meetingCount && c.meetingCount >= 2) // Only include people met in 2+ meetings
      .sort((a, b) => (b.meetingCount || 0) - (a.meetingCount || 0)); // Sort by meeting frequency
  }
}

async function saveCoworkerConfig(coworkers: CoworkerInfo[]): Promise<void> {
  const config: CoworkerConfig = {
    lastUpdated: new Date().toISOString(),
    coworkers: coworkers
  };
  
  const configPath = path.join(process.cwd(), 'coworker_config.json');
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  logger.success(`Saved ${coworkers.length} coworkers to coworker_config.json`);
}

export async function runInitialization(): Promise<void> {
  try {
    logger.banner('Coworker Discovery Initialization');
    logger.info('Analyzing your calendar to discover coworkers...');
    logger.newLine();
    
    // Initialize Google Calendar authentication
    logger.info('Initializing Google Calendar authentication...');
    const stopSpinner = logger.spinner('Connecting to Google Calendar...');
    const auth = await authorize();
    const isValid = await verifyAuth(auth);
    stopSpinner();
    
    if (!isValid) {
      throw new Error('Google Calendar authentication failed');
    }
    logger.success('Google Calendar connected successfully!');
    logger.newLine();
    
    // Create the coworker discovery service (no AI agent needed)
    const discovery = new CoworkerDiscovery();
    
    // Start the discovery process using direct Google Calendar API calls
    logger.info('Starting coworker discovery process...');
    await discovery.discoverCoworkersFromCalendar(auth);
    
    // Get the discovered coworkers
    const discoveredCoworkers = discovery.getDiscoveredCoworkers();
    
    if (discoveredCoworkers.length === 0) {
      logger.warning('No coworkers were discovered from your calendar events.');
      logger.info('This might happen if:');
      logger.info('- You have no recent meetings with external attendees');
      logger.info('- Your calendar events don\'t have attendee information');
      logger.info('- All attendees are system accounts or your own email');
    } else {
      logger.newLine();
      logger.success(`Discovered ${discoveredCoworkers.length} coworkers!`);
      
      // Display discovered coworkers
      logger.info('Found coworkers:');
      for (const coworker of discoveredCoworkers) {
        logger.info(`- ${coworker.name} (${coworker.email})${coworker.role ? ` - ${coworker.role}` : ''} - ${coworker.meetingCount} meetings`);
      }
      
      // Save to config file
      await saveCoworkerConfig(discoveredCoworkers);
    }
    
    logger.newLine();
    logger.success('Initialization complete! Your coworker information has been updated.');
    
  } catch (error) {
    logger.error(`Initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runInitialization().catch(logger.error);
}