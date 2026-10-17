import React from 'react';
import * as Select from '@radix-ui/react-select';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface SelectOption<T = string> {
  value: T;
  label: string;
  description?: string;
  icon?: (props: { className?: string }) => React.ReactNode;
  dotColor?: string;
}

interface CustomSelectProps<T = string> {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  align?: 'start' | 'center' | 'end';
  size?: 'sm' | 'md';
}

export function CustomSelect<T extends string = string>({
  value,
  onChange,
  options,
  placeholder = 'Select option',
  className = '',
  buttonClassName = '',
  align = 'end',
  size = 'md',
}: CustomSelectProps<T>) {
  const selectedOption = options.find((opt) => opt.value === value);

  const sizeClasses =
    size === 'sm'
      ? 'h-7 px-2.5 text-[11px] rounded-lg'
      : 'h-8 px-3 text-xs rounded-xl';

  return (
    <Select.Root value={value} onValueChange={(val) => onChange(val as T)}>
      <Select.Trigger
        aria-label={placeholder}
        className={cn(
          'inline-flex items-center justify-between gap-2 border transition-all cursor-pointer select-none',
          'bg-zinc-900/80 hover:bg-zinc-850 text-zinc-300 border-zinc-800 hover:border-zinc-700',
          'focus:outline-none focus:ring-1 focus:ring-zinc-700',
          sizeClasses,
          buttonClassName,
          className
        )}
      >
        <div className="flex items-center gap-2 truncate">
          {selectedOption?.dotColor && (
            <span
              className={cn(
                'w-2 h-2 rounded-full flex-shrink-0',
                selectedOption.dotColor
              )}
            />
          )}
          {selectedOption?.icon && (
            <selectedOption.icon className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
          )}
          <Select.Value placeholder={placeholder}>
            <span className="font-medium text-zinc-200">
              {selectedOption ? selectedOption.label : placeholder}
            </span>
          </Select.Value>
        </div>
        <Select.Icon asChild>
          <ChevronDown className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={6}
          align={align}
          className={cn(
            'z-50 min-w-[160px] max-w-[260px] rounded-xl bg-zinc-900/95 backdrop-blur-2xl border border-zinc-800 p-1 shadow-2xl shadow-black/80',
            'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95'
          )}
        >
          <Select.Viewport className="p-0.5">
            {options.map((option) => (
              <Select.Item
                key={option.value}
                value={option.value}
                className={cn(
                  'relative flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-300 select-none outline-none transition-colors cursor-pointer',
                  'hover:bg-zinc-800 hover:text-white focus:bg-zinc-800 focus:text-white',
                  'data-[state=checked]:bg-zinc-800 data-[state=checked]:text-zinc-100'
                )}
              >
                <div className="flex items-center gap-2 truncate">
                  {option.dotColor && (
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full flex-shrink-0',
                        option.dotColor
                      )}
                    />
                  )}
                  {option.icon && (
                    <option.icon className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                  )}
                  <Select.ItemText>
                    <span>{option.label}</span>
                  </Select.ItemText>
                </div>

                <Select.ItemIndicator>
                  <Check className="w-3.5 h-3.5 text-zinc-300 flex-shrink-0" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
