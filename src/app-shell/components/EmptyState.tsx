import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-16 h-16 bg-card border border-border rounded-2xl flex items-center justify-center mb-4 shadow-sm">
        <Icon size={28} className="text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-6">{description}</p>
      
      {actionLabel && onAction && (
        <button 
          onClick={onAction}
          className="bg-primary text-foreground px-5 py-2.5 rounded-lg font-medium hover:bg-primary-hover transition-colors btn-active-scale shadow-sm"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

