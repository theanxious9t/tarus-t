import { toast } from "sonner";

class NotificationService {
  private static instance: NotificationService;
  private permission: NotificationPermission = 'default';

  private constructor() {
    if ('Notification' in window) {
      this.permission = Notification.permission;
    }
  }

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  public async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn("This browser does not support notifications");
      return false;
    }

    if (this.permission === 'granted') return true;

    try {
      const permission = await Notification.requestPermission();
      this.permission = permission;
      return permission === 'granted';
    } catch (error) {
      console.error("Error requesting notification permission:", error);
      return false;
    }
  }

  public async sendNotification(title: string, options?: NotificationOptions) {
    if (this.permission !== 'granted') {
      // Fallback to toast if notification permission is not granted
      toast(title, {
        description: options?.body,
      });
      return;
    }

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        registration.showNotification(title, options);
      } else {
        new Notification(title, options);
      }
    } catch (error) {
      console.error("Error sending notification:", error);
      new Notification(title, options);
    }
  }
}

export const notificationService = NotificationService.getInstance();
