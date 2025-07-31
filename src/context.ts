/**
 * Context information for the AI assistant
 * Contains current date and coworker contact information
 */

import * as fs from 'fs';
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

interface ContextInfo {
  currentDate: string;
  currentDateTime: string;
  coworkers: CoworkerInfo[];
}

/**
 * Load coworkers from the configuration file
 */
function loadCoworkers(): CoworkerInfo[] {
  try {
    const configPath = path.join(process.cwd(), 'coworker_config.json');
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf8');
      const config: CoworkerConfig = JSON.parse(configData);
      return config.coworkers || [];
    }
  } catch (error) {
    console.warn('Could not load coworker config:', error);
  }
  
  // Fallback to manual coworker list if config file doesn't exist
  return [
    // Add your actual coworker information here if you don't want to use the init command
    // Example format:
    // { name: "John Doe", email: "john.doe@company.com", role: "Software Engineer" },
    // { name: "Jane Smith", email: "jane.smith@company.com", role: "Product Manager" },
    // { name: "Mike Johnson", email: "mike.johnson@company.com", role: "Designer" },
  ];
}

/**
 * Get the current context information including today's date and coworker emails
 */
export function getContext(): ContextInfo {
  const now = new Date();
  
  return {
    currentDate: now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric', 
      month: 'long',
      day: 'numeric'
    }),
    currentDateTime: now.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    }),
    coworkers: loadCoworkers()
  };
}

/**
 * Generate a context string to be included in the system prompt
 */
export function generateContextString(): string {
  const context = getContext();
  
  let contextString = `\n\nCURRENT CONTEXT:\n`;
  contextString += `Today is: ${context.currentDate}\n`;
  contextString += `Current time: ${context.currentDateTime}\n`;
  
  if (context.coworkers.length > 0) {
    contextString += `\nCoworker contacts:\n`;
    context.coworkers.forEach(coworker => {
      contextString += `- ${coworker.name}`;
      if (coworker.role) {
        contextString += ` (${coworker.role})`;
      }
      contextString += `: ${coworker.email}`;
      if (coworker.meetingCount) {
        contextString += ` (${coworker.meetingCount} meetings)`;
      }
      contextString += `\n`;
    });
  } else {
    contextString += `\nNo coworker information found. Run 'calbot init' to automatically discover coworkers from your calendar, or manually add them to coworker_config.json\n`;
  }
  
  return contextString;
}