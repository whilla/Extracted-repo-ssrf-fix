declare module 'sonner' {
  import * as React from 'react';

  interface ToastOptions {
    description?: string;
    action?: React.ReactElement;
    cancel?: React.ReactElement;
    duration?: number;
    id?: string | number;
    icon?: React.ReactNode;
    classNames?: Record<string, string>;
    className?: string;
    descriptionClassName?: string;
    style?: React.CSSProperties;
    cancelBtnStyle?: React.CSSProperties;
    actionBtnStyle?: React.CSSProperties;
    closeButton?: boolean;
    unstyled?: boolean;
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center';
  }

  interface SonnerToast {
    (message: string | React.ReactElement, options?: ToastOptions): string | number;
    success(message: string | React.ReactElement, options?: ToastOptions): string | number;
    error(message: string | React.ReactElement, options?: ToastOptions): string | number;
    info(message: string | React.ReactElement, options?: ToastOptions): string | number;
    warning(message: string | React.ReactElement, options?: ToastOptions): string | number;
    loading(message: string | React.ReactElement, options?: ToastOptions): string | number;
    promise<T>(promise: Promise<T>, data: { loading: string | React.ReactElement; success: string | React.ReactElement | ((data: T) => string | React.ReactElement); error: string | React.ReactElement | ((error: unknown) => string | React.ReactElement) }, opts?: ToastOptions): Promise<T>;
    custom(message: string | React.ReactElement, options?: ToastOptions): string | number;
    dismiss(toastId?: string | number): void;
  }

  export const toast: SonnerToast;
  export const Toaster: React.FC<{
    position?: string;
    expand?: boolean;
    visibleToasts?: number;
    closeButton?: boolean;
    toastOptions?: ToastOptions;
    duration?: number;
    theme?: 'light' | 'dark' | 'system';
    richColors?: boolean;
    offset?: string | number;
    mobileOffset?: string | number;
    style?: React.CSSProperties;
    className?: string;
    dir?: 'rtl' | 'ltr';
    icons?: Record<string, React.ReactNode>;
    containerAriaLabel?: string;
    pauseWhenPageIsHidden?: boolean;
    cn?: (...classes: (string | undefined | false)[]) => string;
  }>;
  export function useSonner(): { toasts: Array<{ id: string | number; title?: string; description?: string; action?: React.ReactElement; cancel?: React.ReactElement; type?: string; dismissible?: boolean; offset?: string | number; className?: string; descriptionClassName?: string; invert?: boolean; visible?: boolean; position?: string }> };
}
