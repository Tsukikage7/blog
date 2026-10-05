import "../styles/components/toast.css";
import {
  TOAST_POSITION_CLASSES,
  TOAST_TYPE_CONFIG,
  toastContentClasses,
} from "./toastConfig";


export interface ToastOptions {
  title?: string;
  content: string;
  type?: 'success' | 'info' | 'warning' | 'error';
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
  duration?: number; 
  showIcon?: boolean;
  closable?: boolean;
}

export function showToast(options: ToastOptions): HTMLElement {
  const {
    title,
    content,
    type = 'info',
    position = 'top-right',
    duration = 3000,
    showIcon = true,
    closable = true
  } = options;

  const config = TOAST_TYPE_CONFIG[type];
  const positionClass = TOAST_POSITION_CLASSES[position];

  
  const toastContainer = document.createElement('div');
  toastContainer.className = `toast-container toast-container--mobile-wide fixed z-50 ${positionClass} pointer-events-none`;
  toastContainer.dataset.duration = duration.toString();
  toastContainer.dataset.position = position;

  
  const toastContent = document.createElement('div');
  toastContent.className = toastContentClasses(config);

  
  const lightEffect = document.createElement('div');
  lightEffect.className = 'absolute inset-0 rounded-2xl bg-linear-to-r from-foreground/5 to-transparent opacity-50';
  toastContent.appendChild(lightEffect);

  
  
  const contentArea = document.createElement('div');
  contentArea.className = 'flex items-start gap-3 relative z-10';

  
  if (showIcon) {
    const iconDiv = document.createElement('div');
    iconDiv.className = `
      shrink-0 w-8 h-8 rounded-full
      bg-linear-to-br ${config.bgColor}
      border ${config.borderColor}
      flex items-center justify-center
      text-lg font-bold ${config.textColor}
      shadow-lg
    `;
    iconDiv.textContent = config.icon;
    contentArea.appendChild(iconDiv);
  }

  
  const textDiv = document.createElement('div');
  textDiv.className = 'flex-1 min-w-0';

  if (title) {
    const titleElement = document.createElement('h4');
    titleElement.className = `text-md font-bold ${config.textColor} my-2 leading-tight`;
    titleElement.textContent = title;
    textDiv.appendChild(titleElement);
  }

  const contentElement = document.createElement('p');
  contentElement.className = 'text-foreground text-sm leading-relaxed';
  contentElement.setHTMLUnsafe(content);
  textDiv.appendChild(contentElement);

  contentArea.appendChild(textDiv);

  
  if (closable) {
    const closeBtn = document.createElement('button');
    closeBtn.className = 'w-8 h-8 rounded-full bg-card/60 hover:bg-muted transition-colors duration-200 flex items-center justify-center text-muted-foreground hover:text-foreground';
    closeBtn.innerHTML = '<span class="text-xs">×</span>';
    closeBtn.onclick = () => removeToast(toastContainer);
    contentArea.appendChild(closeBtn);
  }

  toastContent.appendChild(contentArea);

  
  if (duration > 0) {
    const progressContainer = document.createElement('div');
    progressContainer.className = 'absolute bottom-0 left-0 right-0 h-1 bg-foreground/10 rounded-b-2xl overflow-hidden';
    
    const progressBar = document.createElement('div');
    progressBar.className = `h-full bg-linear-to-r ${config.bgColor} toast-progress`;
    progressBar.style.animationDuration = `${duration}ms`;
    
    progressContainer.appendChild(progressBar);
    toastContent.appendChild(progressContainer);
  }

  toastContainer.appendChild(toastContent);
  document.body.appendChild(toastContainer);

  
  if (duration > 0) {
    setTimeout(() => {
      removeToast(toastContainer);
    }, duration);
  }

  return toastContainer;
}

function removeToast(toastElement: HTMLElement) {
  const content = toastElement.querySelector('.toast-content') as HTMLElement;
  if (content) {
    content.style.transform = 'translateY(-20px) scale(0.95)';
    content.style.opacity = '0';
    content.style.transition = 'all 0.3s ease-in';
    
    setTimeout(() => {
      toastElement.remove();
    }, 300);
  }
}

export function showSuccess(content: string, title?: string, options?: Partial<ToastOptions>) {
  return showToast({ ...options, content, title, type: 'success' });
}

export function showInfo(content: string, title?: string, options?: Partial<ToastOptions>) {
  return showToast({ ...options, content, title, type: 'info' });
}

export function showWarning(content: string, title?: string, options?: Partial<ToastOptions>) {
  return showToast({ ...options, content, title, type: 'warning' });
}

export function showError(content: string, title?: string, options?: Partial<ToastOptions>) {
  return showToast({ ...options, content, title, type: 'error' });
}

export function clearAllToasts() {
  const toasts = document.querySelectorAll('.toast-container');
  toasts.forEach(toast => {
    removeToast(toast as HTMLElement);
  });
}

export function clearToastsByPosition(position: ToastOptions['position'] = 'top-right') {
  const toasts = document.querySelectorAll(`.toast-container[data-position="${position}"]`);
  toasts.forEach(toast => {
    removeToast(toast as HTMLElement);
  });
}
