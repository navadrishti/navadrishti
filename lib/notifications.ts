import { toast } from 'sonner';

/**
 * Centralized notification system for the entire application
 * Replaces console.error, console.warn, and other console methods with user-friendly toast notifications
 */

export const notify = {
  /**
   * Show success notification
   */
  success: (message: string, description?: string) => {
    toast.success(message, {
      description,
      duration: 4000,
    });
  },

  /**
   * Show error notification
   */
  error: (message: string, description?: string) => {
    toast.error(message, {
      description,
      duration: 5000,
    });
  },

  /**
   * Show warning notification
   */
  warning: (message: string, description?: string) => {
    toast.warning(message, {
      description,
      duration: 4500,
    });
  },

  /**
   * Show info notification
   */
  info: (message: string, description?: string) => {
    toast.info(message, {
      description,
      duration: 4000,
    });
  },

  /**
   * Show loading notification (returns promise that can be resolved)
   */
  loading: (message: string) => {
    return toast.loading(message);
  },

  /**
   * Update a loading notification to success
   */
  promise: <T>(
    promise: Promise<T>,
    {
      loading,
      success,
      error,
    }: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((error: any) => string);
    }
  ) => {
    return toast.promise(promise, {
      loading,
      success,
      error,
    });
  },

  /**
   * Dismiss all notifications
   */
  dismiss: () => {
    toast.dismiss();
  },
};

/**
 * API Error Handler - converts API errors to user-friendly notifications
 */
export const handleApiError = (error: any, fallbackMessage = 'An unexpected error occurred') => {
  let message = fallbackMessage;
  let description: string | undefined;

  if (error?.response?.data?.error) {
    message = error.response.data.error;
  } else if (error?.response?.data?.message) {
    message = error.response.data.message;
  } else if (error?.message) {
    message = error.message;
  }

  // Add description for specific error types
  if (error?.response?.status === 401) {
    description = 'Please log in again to continue';
  } else if (error?.response?.status === 403) {
    description = 'You do not have permission to perform this action';
  } else if (error?.response?.status === 404) {
    description = 'The requested resource was not found';
  } else if (error?.response?.status >= 500) {
    description = 'Server error. Please try again later';
  }

  notify.error(message, description);
};

/**
 * Form Validation Helper
 */
export const validateForm = (fields: Record<string, any>, rules: Record<string, string>) => {
  for (const [field, rule] of Object.entries(rules)) {
    if (!fields[field] || fields[field].toString().trim() === '') {
      notify.error(`Validation Error`, `${rule} is required`);
      return false;
    }
  }
  return true;
};

/**
 * Network Error Handler
 */
export const handleNetworkError = (error: any) => {
  if (!navigator.onLine) {
    notify.error('No Internet Connection', 'Please check your internet connection and try again');
  } else if (error?.code === 'NETWORK_ERROR') {
    notify.error('Network Error', 'Unable to connect to server. Please try again');
  } else {
    notify.error('Connection Error', 'Something went wrong. Please try again');
  }
};

/**
 * File Upload Error Handler
 */
export const handleFileError = (error: any, filename?: string) => {
  let message = 'File upload failed';
  
  if (filename) {
    message = `Failed to upload ${filename}`;
  }

  if (error?.message?.includes('size')) {
    notify.error(message, 'File size is too large');
  } else if (error?.message?.includes('type')) {
    notify.error(message, 'File type is not supported');
  } else {
    notify.error(message, 'Please try again');
  }
};

export default notify;