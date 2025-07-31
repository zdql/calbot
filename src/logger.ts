import chalk from 'chalk';

export interface LoggerOptions {
  enableColors?: boolean;
  enableEmojis?: boolean;
}

export class StyledLogger {
  private options: Required<LoggerOptions>;

  constructor(options: LoggerOptions = {}) {
    this.options = {
      enableColors: options.enableColors ?? true,
      enableEmojis: options.enableEmojis ?? true,
    };
  }

  // Banner and headers
  banner(text: string): void {
    const banner = this.options.enableColors 
      ? chalk.bold.cyan(`\n=== ${text} ===\n`)
      : `\n=== ${text} ===\n`;
    console.log(banner);
  }

  header(text: string): void {
    const header = this.options.enableColors 
      ? chalk.bold.blue(text)
      : text;
    console.log(header);
  }

  // Status messages
  success(message: string): void {
    const emoji = this.options.enableEmojis ? '✅ ' : '';
    const styled = this.options.enableColors 
      ? chalk.green(`${emoji}${message}`)
      : `${emoji}${message}`;
    console.log(styled);
  }

  warning(message: string): void {
    const emoji = this.options.enableEmojis ? '⚠️  ' : '';
    const styled = this.options.enableColors 
      ? chalk.yellow(`${emoji}${message}`)
      : `${emoji}${message}`;
    console.log(styled);
  }

  error(message: string): void {
    const emoji = this.options.enableEmojis ? '❌ ' : '';
    const styled = this.options.enableColors 
      ? chalk.red(`${emoji}${message}`)
      : `${emoji}${message}`;
    console.log(styled);
  }

  info(message: string): void {
    const emoji = this.options.enableEmojis ? 'ℹ️  ' : '';
    const styled = this.options.enableColors 
      ? chalk.blue(`${emoji}${message}`)
      : `${emoji}${message}`;
    console.log(styled);
  }

  // User interaction
  userPrompt(): void {
    const prompt = this.options.enableColors 
      ? chalk.bold.magenta('You: ')
      : 'You: ';
    process.stdout.write(prompt);
  }

  agentLabel(): void {
    const label = this.options.enableColors 
      ? chalk.bold.green('Agent: ')
      : 'Agent: ';
    process.stdout.write(label);
  }

  // Tool execution
  toolStart(toolName: string): void {
    const message = this.options.enableColors 
      ? chalk.dim.italic(`Executing ${toolName}...`)
      : `Executing ${toolName}...`;
    console.log(message);
  }

  toolComplete(toolName: string): void {
    const message = this.options.enableColors 
      ? chalk.dim.italic(`${toolName} completed successfully`)
      : `${toolName} completed successfully`;
    console.log(message);
  }

  // Streaming output
  streamChunk(text: string): void {
    process.stdout.write(text);
  }

  streamComplete(): void {
    console.log(); // New line after streaming
  }

  // Calendar event formatting
  formatCalendarEvent(event: any): string {
    const lines: string[] = [];
    
    // Event title with emoji
    const title = this.options.enableColors 
      ? chalk.bold.cyan(`📅 ${event.summary || 'Untitled Event'}`)
      : `📅 ${event.summary || 'Untitled Event'}`;
    lines.push(title);

    // Event ID
    if (event.id) {
      const eventId = this.options.enableColors 
        ? chalk.gray(`   🆔 Event ID: ${event.id}`)
        : `   🆔 Event ID: ${event.id}`;
      lines.push(eventId);
    }

    // Calendar ID
    if (event.organizer?.email || event.calendarId) {
      const calendarId = event.calendarId || event.organizer?.email || 'primary';
      const calId = this.options.enableColors 
        ? chalk.gray(`   📋 Calendar ID: ${calendarId}`)
        : `   📋 Calendar ID: ${calendarId}`;
      lines.push(calId);
    }

    // Date and time
    if (event.start?.dateTime || event.start?.date) {
      const dateInfo = this.formatDateTime(event.start, event.end);
      const styledDate = this.options.enableColors 
        ? chalk.yellow(`   📆 ${dateInfo}`)
        : `   📆 ${dateInfo}`;
      lines.push(styledDate);
    }

    // Location
    if (event.location) {
      const location = this.options.enableColors 
        ? chalk.cyan(`   📍 ${event.location}`)
        : `   📍 ${event.location}`;
      lines.push(location);
    }

    // Attendees
    if (event.attendees && event.attendees.length > 0) {
      const attendeeList = event.attendees.map((a: any) => a.email).join(', ');
      const attendees = this.options.enableColors 
        ? chalk.blue(`   👥 ${attendeeList}`)
        : `   👥 ${attendeeList}`;
      lines.push(attendees);
    }

    // Description
    if (event.description) {
      const description = this.options.enableColors 
        ? chalk.dim(`   📝 ${event.description}`)
        : `   📝 ${event.description}`;
      lines.push(description);
    }

    // Event link
    if (event.htmlLink) {
      const link = this.options.enableColors 
        ? chalk.underline.blue(`   🔗 View in Calendar`)
        : `   🔗 ${event.htmlLink}`;
      lines.push(link);
    }

    return lines.join('\n');
  }

  private formatDateTime(start: any, end: any): string {
    const startDate = new Date(start.dateTime || start.date);
    const endDate = end ? new Date(end.dateTime || end.date) : null;
    
    if (start.date && !start.dateTime) {
      // All-day event
      return startDate.toLocaleDateString();
    }
    
    if (endDate) {
      const sameDay = startDate.toDateString() === endDate.toDateString();
      if (sameDay) {
        return `${startDate.toLocaleDateString()} ${startDate.toLocaleTimeString()} - ${endDate.toLocaleTimeString()}`;
      } else {
        return `${startDate.toLocaleString()} - ${endDate.toLocaleString()}`;
      }
    }
    
    return startDate.toLocaleString();
  }

  // Progress indicators
  spinner(message: string): () => void {
    if (!this.options.enableEmojis) {
      console.log(message);
      return () => {};
    }

    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;
    
    const interval = setInterval(() => {
      process.stdout.write(`\r${frames[i]} ${message}`);
      i = (i + 1) % frames.length;
    }, 80);

    return () => {
      clearInterval(interval);
      process.stdout.write('\r');
    };
  }

  // Dividers and spacing
  divider(char: string = '─', length: number = 50): void {
    const line = this.options.enableColors 
      ? chalk.dim(char.repeat(length))
      : char.repeat(length);
    console.log(line);
  }

  newLine(): void {
    console.log();
  }

  // Tool result formatting
  toolResult(toolName: string, result: string): void {
    const maxLength = 300; // Maximum characters to display
    const maxLines = 5; // Maximum lines to display
    
    let displayResult = result;
    
    // Truncate by length if too long
    if (result.length > maxLength) {
      displayResult = result.substring(0, maxLength) + '...';
    }
    
    // Truncate by lines if too many
    const lines = displayResult.split('\n');
    if (lines.length > maxLines) {
      displayResult = lines.slice(0, maxLines).join('\n') + '\n...';
    }
    
    // Format the output
    const toolEmoji = this.getToolEmoji(toolName);
    const header = this.options.enableColors 
      ? chalk.blue.bold(`${toolEmoji} ${toolName} result:`)
      : `${toolEmoji} ${toolName} result:`;
    
    const content = this.options.enableColors 
      ? chalk.dim(displayResult)
      : displayResult;
    
    console.log(header);
    console.log(content);
    if (result.length > maxLength || lines.length > maxLines) {
      const truncateMsg = this.options.enableColors 
        ? chalk.yellow('   (output truncated)')
        : '   (output truncated)';
      console.log(truncateMsg);
    }
    console.log(); // Add spacing
  }
  
  private getToolEmoji(toolName: string): string {
    if (!this.options.enableEmojis) return '';
    
    const emojiMap: Record<string, string> = {
      'bash': '💻',
      'get_events_in_time_range': '📅',
      'create_event': '➕',
      'create_quick_event': '⚡',
      'update_event': '✏️',
      'delete_event': '🗑️',
      'check_conflicts': '⚠️',
      'find_free_time': '🔍',
      'get_calendars': '📋'
    };
    
    return emojiMap[toolName] || '🔧';
  }

  // Plain text (no styling)
  plain(text: string): void {
    console.log(text);
  }
}

// Default logger instance
export const logger = new StyledLogger();