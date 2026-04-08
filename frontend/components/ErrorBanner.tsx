"use client";

import { AlertTriangle } from "lucide-react";

type Props = {
  message: string;
  onRetry?: () => void;
  className?: string;
};

export function ErrorBanner({ message, onRetry, className = "" }: Props) {
  return (
    <div
      className={`flex items-start gap-3 p-4 bg-red-950/30 border border-red-900 rounded-lg ${className}`}
    >
      <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-red-200 mb-2">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="text-xs uppercase tracking-wider text-red-400 hover:text-red-300 font-bold"
          >
            Try again →
          </button>
        )}
      </div>
    </div>
  );
}
