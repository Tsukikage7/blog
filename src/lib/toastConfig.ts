export const TOAST_TYPE_CONFIG = {
  success: {
    bgColor: "from-success/10 to-success/5",
    borderColor: "border-success/30",
    textColor: "text-success",
    icon: "✓",
  },
  info: {
    bgColor: "from-info/10 to-info/5",
    borderColor: "border-info/30",
    textColor: "text-info",
    icon: "ℹ",
  },
  warning: {
    bgColor: "from-warning/10 to-warning/5",
    borderColor: "border-warning/30",
    textColor: "text-warning",
    icon: "⚠",
  },
  error: {
    bgColor: "from-destructive/10 to-destructive/5",
    borderColor: "border-destructive/30",
    textColor: "text-destructive",
    icon: "✕",
  },
} as const;

export const TOAST_POSITION_CLASSES = {
  "top-right": "top-4 right-4",
  "top-left": "top-4 left-4",
  "bottom-right": "bottom-4 right-4",
  "bottom-left": "bottom-4 left-4",
  "top-center": "top-4 left-1/2 -translate-x-1/2",
  "bottom-center": "bottom-4 left-1/2 -translate-x-1/2",
} as const;

export function toastContentClasses(
  config: (typeof TOAST_TYPE_CONFIG)[keyof typeof TOAST_TYPE_CONFIG],
) {
  return [
    "toast-content toast-slide-in pointer-events-auto",
    "bg-linear-to-br",
    config.bgColor,
    "border",
    config.borderColor,
    "rounded-2xl shadow-xl shadow-foreground/20 p-4",
    "min-w-[280px] max-w-[400px] transform transition-all duration-500 ease-out",
    "hover:scale-105 hover:shadow-3xl",
  ].join(" ");
}
