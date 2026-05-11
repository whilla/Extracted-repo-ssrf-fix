declare module 'sonner' {
  export interface ToastOptions {
    duration?: number;
  }

  export interface ToastFn {
    (message: string, options?: ToastOptions): string;
    success(message: string, options?: ToastOptions): string;
    error(message: string, options?: ToastOptions): string;
    warning(message: string, options?: ToastOptions): string;
    info(message: string, options?: ToastOptions): string;
    loading(message: string, options?: ToastOptions): string;
  }

  export const toast: ToastFn;
  export function success(message: string, options?: ToastOptions): string;
  export function error(message: string, options?: ToastOptions): string;
  export function warning(message: string, options?: ToastOptions): string;
  export function info(message: string, options?: ToastOptions): string;
  export function loading(message: string, options?: ToastOptions): string;
  export function dismiss(id?: string): void;

  export interface ToasterProps {
    theme?: 'light' | 'dark' | 'system';
    position?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
    className?: string;
  }

  export function Toaster(props: ToasterProps): React.ReactElement;
}
