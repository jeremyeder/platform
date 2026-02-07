/**
 * PageHeader component
 * Consistent page header with title, description, and optional actions
 */

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4 pb-4 border-b border-border-light', className)}>
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">{title}</h1>
        {description && (
          <p className="text-text-secondary">{description}</p>
        )}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
