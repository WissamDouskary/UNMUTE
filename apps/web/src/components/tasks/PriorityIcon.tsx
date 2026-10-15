import { TaskPriority } from '@unmute/api-client';
import { cn } from '../../lib/utils';

interface PriorityIconProps {
  priority: TaskPriority;
  className?: string;
  showLabel?: boolean;
}

export function PriorityIcon({ priority, className, showLabel = false }: PriorityIconProps) {
  let icon = null;
  let label = 'Low';
  let colorClass = 'text-zinc-500';

  switch (priority) {
    case 'URGENT':
      label = 'Urgent';
      colorClass = 'text-red-500';
      icon = (
        <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M8 4.5v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="8" cy="11.5" r="1" fill="currentColor" />
        </svg>
      );
      break;

    case 'HIGH':
      label = 'High';
      colorClass = 'text-amber-400';
      icon = (
        <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
          <rect x="2" y="10" width="2.5" height="4" rx="0.5" />
          <rect x="6.75" y="6.5" width="2.5" height="7.5" rx="0.5" />
          <rect x="11.5" y="3" width="2.5" height="11" rx="0.5" />
        </svg>
      );
      break;

    case 'MEDIUM':
      label = 'Medium';
      colorClass = 'text-blue-400';
      icon = (
        <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
          <rect x="2" y="10" width="2.5" height="4" rx="0.5" />
          <rect x="6.75" y="6.5" width="2.5" height="7.5" rx="0.5" />
          <rect x="11.5" y="3" width="2.5" height="11" rx="0.5" fillOpacity="0.2" />
        </svg>
      );
      break;

    case 'LOW':
    default:
      label = 'Low';
      colorClass = 'text-zinc-500';
      icon = (
        <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
          <rect x="2" y="10" width="2.5" height="4" rx="0.5" />
          <rect x="6.75" y="6.5" width="2.5" height="7.5" rx="0.5" fillOpacity="0.2" />
          <rect x="11.5" y="3" width="2.5" height="11" rx="0.5" fillOpacity="0.2" />
        </svg>
      );
      break;
  }

  return (
    <span
      title={`${label} Priority`}
      className={cn('inline-flex items-center gap-1.5', colorClass, className)}
    >
      {icon}
      {showLabel && <span className="text-xs font-medium">{label}</span>}
    </span>
  );
}
