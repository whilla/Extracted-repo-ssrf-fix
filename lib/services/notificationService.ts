

export interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  data?: Record<string, unknown>;
  requireInteraction?: boolean;
}

export type NotificationType = 
  | 'post_published'
  | 'post_failed'
  | 'content_ready'
  | 'content_failed'
  | 'analytics_summary'
  | 'trend_alert'
  | 'scheduled_reminder'
  | 'system_status';

// Notification presets
const NOTIFICATION_PRESETS: Record<NotificationType, Partial<NotificationOptions>> = {
  post_published: {
    icon: '/icon.svg',
    tag: 'publish',
  },
  post_failed: {
    icon: '/icon.svg',
    tag: 'error',
    requireInteraction: true,
  },
  content_ready: {
    icon: '/icon.svg',
    tag: 'content',
  },
  content_failed: {
    icon: '/icon.svg',
    tag: 'content-failed',
    requireInteraction: true,
  },
  analytics_summary: {
    icon: '/icon.svg',
    tag: 'analytics',
  },
  trend_alert: {
    icon: '/icon.svg',
    tag: 'trend',
  },
  scheduled_reminder: {
    icon: '/icon.svg',
    tag: 'schedule',
  },
  system_status: {
    icon: '/icon.svg',
    tag: 'system',
  },
};

class NotificationService {
  private permission: NotificationPermission = 'default';
  private listeners: Map<string, ((data: unknown) => void)[]> = new Map();

  constructor() {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      this.permission = Notification.permission;
    }
  }

  // Request notification permission
  async requestPermission(): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      console.warn('Notifications not supported');
      return false;
    }

    try {
      this.permission = await Notification.requestPermission();
      return this.permission === 'granted';
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }

  // Check if notifications are enabled
  isEnabled(): boolean {
    return this.permission === 'granted';
  }

  // Get current permission status
  getPermission(): NotificationPermission {
    return this.permission;
  }

  // Show a notification
  async show(
    type: NotificationType,
    options: NotificationOptions
  ): Promise<Notification | null> {
    if (!this.isEnabled()) {
      const granted = await this.requestPermission();
      if (!granted) {
        console.warn('Notification permission not granted');
        return null;
      }
    }

    const preset = NOTIFICATION_PRESETS[type] || {};
    const mergedOptions: NotificationOptions = {
      ...preset,
      ...options,
    };

    try {
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          await registration.showNotification(mergedOptions.title, {
            body: mergedOptions.body,
            icon: mergedOptions.icon,
            tag: mergedOptions.tag,
            data: { type, ...mergedOptions.data },
            requireInteraction: mergedOptions.requireInteraction,
          });
          return null;
        }
      }

      const notification = new Notification(mergedOptions.title, {
        body: mergedOptions.body,
        icon: mergedOptions.icon,
        tag: mergedOptions.tag,
        data: mergedOptions.data,
        requireInteraction: mergedOptions.requireInteraction,
      });

      // Handle click
      notification.onclick = () => {
        window.focus();
        notification.close();
        this.emit('click', { type, ...mergedOptions.data });
      };

      // Handle close
      notification.onclose = () => {
        this.emit('close', { type, ...mergedOptions.data });
      };

      return notification;
    } catch (error) {
      console.error('Error showing notification:', error);
      return null;
    }
  }

  // Convenience methods for specific notification types
  async notifyPostPublished(platforms: string[], postId: string): Promise<void> {
    await this.show('post_published', {
      title: 'Post Published!',
      body: `Your post is now live on ${platforms.join(', ')}`,
      data: { postId, platforms },
    });
  }

  async notifyPostFailed(platform: string, error: string, postId: string): Promise<void> {
    await this.show('post_failed', {
      title: 'Post Failed',
      body: `Failed to publish to ${platform}: ${error}`,
      data: { postId, platform, error },
    });
  }

  async notifyContentReady(contentType: string, contentId: string): Promise<void> {
    await this.show('content_ready', {
      title: 'Content Ready!',
      body: `Your ${contentType} has been generated and is ready for review`,
      data: { contentType, contentId },
    });
  }

  async notifyContentFailed(contentType: string, error: string): Promise<void> {
    await this.show('content_failed', {
      title: 'Generation Failed',
      body: `${contentType} could not be completed: ${error}`,
      data: { contentType, error },
    });
  }

  async notifyAnalyticsSummary(summary: string): Promise<void> {
    await this.show('analytics_summary', {
      title: 'Weekly Analytics Summary',
      body: summary,
    });
  }

  async notifyTrendAlert(trend: string, niche: string): Promise<void> {
    await this.show('trend_alert', {
      title: 'Trending in Your Niche!',
      body: `"${trend}" is trending in ${niche}. Create content now!`,
      data: { trend, niche },
    });
  }

  async notifyScheduledReminder(postTitle: string, scheduledTime: Date): Promise<void> {
    await this.show('scheduled_reminder', {
      title: 'Upcoming Scheduled Post',
      body: `"${postTitle}" will be published at ${scheduledTime.toLocaleTimeString()}`,
      data: { postTitle, scheduledTime: scheduledTime.toISOString() },
    });
  }

  async notifySystemStatus(status: 'online' | 'offline', message: string): Promise<void> {
    await this.show('system_status', {
      title: status === 'offline' ? 'Offline Mode Enabled' : 'Back Online',
      body: message,
      data: { status },
    });
  }

  // Event listener system
  on(event: string, callback: (data: unknown) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  off(event: string, callback: (data: unknown) => void): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emit(event: string, data: unknown): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(cb => cb(data));
    }
  }

  // Schedule a notification for later
  scheduleNotification(
    type: NotificationType,
    options: NotificationOptions,
    date: Date
  ): NodeJS.Timeout | null {
    const delay = date.getTime() - Date.now();
    
    if (delay <= 0) {
      console.warn('Cannot schedule notification in the past');
      return null;
    }

    return setTimeout(() => {
      this.show(type, options);
    }, delay);
  }

  // Cancel a scheduled notification
  cancelScheduledNotification(timeoutId: NodeJS.Timeout): void {
    clearTimeout(timeoutId);
  }
}

// Export singleton instance
export const notificationService = new NotificationService();
