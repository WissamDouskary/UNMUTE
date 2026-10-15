import { useState, useRef, useEffect, type ReactNode } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption<T = string> {
  value: T;
  label: string;
  description?: string;
  icon?: (props: { className?: string }) => ReactNode;
  dotColor?: string;
}

interface CustomSelectProps<T = string> {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  dropdownClassName?: string;
  align?: 'left' | 'right';
  size?: 'sm' | 'md';
}

export function CustomSelect<T = string>({
  value,
  onChange,
  options,
  placeholder = 'Select option',
  className = '',
  buttonClassName = '',
  dropdownClassName = '',
  align = 'left',
  size = 'md',
}: CustomSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const sizeClasses =
    size === 'sm'
      ? 'px-2.5 py-1.5 text-xs rounded-lg'
      : 'px-3 py-2 text-xs rounded-xl';

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`flex items-center justify-between gap-2 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-zinc-200 transition-all cursor-pointer shadow-sm focus:outline-none focus:border-violet-500/80 ${sizeClasses} ${buttonClassName}`}
      >
        <div className="flex items-center gap-2 truncate">
          {selectedOption?.dotColor && (
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${selectedOption.dotColor}`}
            />
          )}
          {selectedOption?.icon && (
            <selectedOption.icon className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
          )}
          <span className="truncate font-medium">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-500 transition-transform duration-200 flex-shrink-0 ${
            isOpen ? 'rotate-180 text-violet-400' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          role="listbox"
          className={`absolute z-50 mt-1.5 min-w-[160px] max-w-[240px] bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 rounded-xl shadow-2xl shadow-black/60 p-1 animate-in fade-in zoom-in-95 duration-100 ${
            align === 'right' ? 'right-0' : 'left-0'
          } ${dropdownClassName}`}
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                type="button"
                key={String(option.value)}
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs text-left transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-violet-600/15 text-violet-300 font-semibold'
                    : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  {option.dotColor && (
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${option.dotColor}`}
                    />
                  )}
                  {option.icon && (
                    <option.icon className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                  )}
                  <div className="truncate">
                    <div>{option.label}</div>
                    {option.description && (
                      <div className="text-[10px] text-zinc-500 font-normal truncate">
                        {option.description}
                      </div>
                    )}
                  </div>
                </div>

                {isSelected && (
                  <Check className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
