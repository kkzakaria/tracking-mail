import { MicrosoftUser } from '../types/microsoft-graph';

/**
 * Format user display name
 */
export function formatUserDisplayName(user: MicrosoftUser): string {
  if (user.displayName) {
    return user.displayName;
  }

  if (user.givenName && user.surname) {
    return `${user.givenName} ${user.surname}`;
  }

  if (user.givenName) {
    return user.givenName;
  }

  if (user.mail) {
    return user.mail;
  }

  if (user.userPrincipalName) {
    return user.userPrincipalName;
  }

  return 'Unknown User';
}

/**
 * Get user's primary email address
 */
export function getUserPrimaryEmail(user: MicrosoftUser): string | null {
  return user.mail || user.userPrincipalName || null;
}

/**
 * Format user's phone number
 */
export function formatPhoneNumber(phoneNumber: string): string {
  if (!phoneNumber) return '';

  // Remove all non-digit characters
  const digits = phoneNumber.replace(/\D/g, '');

  // Format based on length
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  return phoneNumber; // Return original if can't format
}

/**
 * Get user's first available phone number
 */
export function getUserPhone(user: MicrosoftUser): string | null {
  if (user.mobilePhone) {
    return user.mobilePhone;
  }

  if (user.businessPhones && user.businessPhones.length > 0) {
    return user.businessPhones[0];
  }

  return null;
}

/**
 * Check if user has complete profile information
 */
export function isUserProfileComplete(user: MicrosoftUser): boolean {
  return !!(
    user.displayName &&
    (user.mail || user.userPrincipalName) &&
    user.givenName &&
    user.surname
  );
}

/**
 * Generate user initials for avatar
 */
export function getUserInitials(user: MicrosoftUser): string {
  if (user.givenName && user.surname) {
    return `${user.givenName.charAt(0)}${user.surname.charAt(0)}`.toUpperCase();
  }

  if (user.displayName) {
    const names = user.displayName.split(' ');
    if (names.length >= 2) {
      return `${names[0].charAt(0)}${names[names.length - 1].charAt(0)}`.toUpperCase();
    }
    return user.displayName.charAt(0).toUpperCase();
  }

  if (user.mail) {
    return user.mail.charAt(0).toUpperCase();
  }

  if (user.userPrincipalName) {
    return user.userPrincipalName.charAt(0).toUpperCase();
  }

  return '?';
}

/**
 * Sort users by display name
 */
export function sortUsersByName(users: MicrosoftUser[]): MicrosoftUser[] {
  return users.sort((a, b) => {
    const nameA = formatUserDisplayName(a).toLowerCase();
    const nameB = formatUserDisplayName(b).toLowerCase();
    return nameA.localeCompare(nameB);
  });
}

/**
 * Filter users by search term
 */
export function filterUsers(users: MicrosoftUser[], searchTerm: string): MicrosoftUser[] {
  if (!searchTerm) return users;

  const search = searchTerm.toLowerCase();

  return users.filter(user => {
    const displayName = formatUserDisplayName(user).toLowerCase();
    const email = getUserPrimaryEmail(user)?.toLowerCase() || '';
    const department = user.department?.toLowerCase() || '';
    const jobTitle = user.jobTitle?.toLowerCase() || '';

    return (
      displayName.includes(search) ||
      email.includes(search) ||
      department.includes(search) ||
      jobTitle.includes(search)
    );
  });
}

/**
 * Group users by department
 */
export function groupUsersByDepartment(users: MicrosoftUser[]): Record<string, MicrosoftUser[]> {
  const groups: Record<string, MicrosoftUser[]> = {};

  users.forEach(user => {
    const department = user.department || 'No Department';
    if (!groups[department]) {
      groups[department] = [];
    }
    groups[department].push(user);
  });

  // Sort users within each department
  Object.keys(groups).forEach(department => {
    groups[department] = sortUsersByName(groups[department]);
  });

  return groups;
}

/**
 * Format email message for display
 */
export function formatEmailMessage(message: Record<string, unknown>) {
  const fromObj = message.from as { emailAddress?: { address?: string; name?: string } } | undefined;
  const receivedDate = message.receivedDateTime;

  return {
    id: message.id,
    subject: message.subject || 'No Subject',
    from: fromObj?.emailAddress?.address || 'Unknown Sender',
    fromName: fromObj?.emailAddress?.name || fromObj?.emailAddress?.address || 'Unknown',
    receivedDateTime: receivedDate ? new Date(receivedDate as string) : new Date(),
    bodyPreview: message.bodyPreview || '',
    isRead: message.isRead || false,
    importance: message.importance || 'normal',
    hasAttachments: message.hasAttachments || false
  };
}

/**
 * Format calendar event for display
 */
export function formatCalendarEvent(event: Record<string, unknown>) {
  const startObj = event.start as { dateTime?: string } | undefined;
  const endObj = event.end as { dateTime?: string } | undefined;
  const organizerObj = event.organizer as { emailAddress?: { name?: string; address?: string } } | undefined;
  const locationObj = event.location as { displayName?: string } | undefined;
  const attendeesArray = event.attendees as Array<unknown> | undefined;

  return {
    id: event.id,
    subject: event.subject || 'No Subject',
    start: startObj?.dateTime ? new Date(startObj.dateTime) : new Date(),
    end: endObj?.dateTime ? new Date(endObj.dateTime) : new Date(),
    organizer: organizerObj?.emailAddress?.name || organizerObj?.emailAddress?.address || 'Unknown',
    location: locationObj?.displayName || '',
    attendeesCount: attendeesArray?.length || 0,
    isAllDay: event.isAllDay || false,
    importance: event.importance || 'normal',
    showAs: event.showAs || 'busy'
  };
}

/**
 * Check if email is valid format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Extract domain from email address
 */
export function getEmailDomain(email: string): string | null {
  if (!isValidEmail(email)) return null;

  const parts = email.split('@');
  return parts.length === 2 ? parts[1] : null;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format date for display
 */
export function formatDate(date: Date): string {
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 1) {
    return 'Today';
  } else if (diffDays === 2) {
    return 'Yesterday';
  } else if (diffDays <= 7) {
    return `${diffDays - 1} days ago`;
  } else {
    return date.toLocaleDateString();
  }
}

/**
 * Format time for display
 */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Format datetime for display
 */
export function formatDateTime(date: Date): string {
  return `${formatDate(date)} at ${formatTime(date)}`;
}

/**
 * Check if date is today
 */
export function isToday(date: Date): boolean {
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

/**
 * Check if date is this week
 */
export function isThisWeek(date: Date): boolean {
  const now = new Date();
  const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
  const endOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + 6));

  return date >= startOfWeek && date <= endOfWeek;
}

/**
 * Truncate text to specified length
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Sanitize HTML content
 */
export function sanitizeHtml(html: string): string {
  // Basic HTML sanitization - in production, use a proper library like DOMPurify
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
}