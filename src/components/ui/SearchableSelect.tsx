import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface SelectOption {
  value: string;
  label: string;
  group?: string;
  indent?: number;
}

interface SearchableSelectProps {
  options: SelectOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  clearLabel?: string;
  className?: string;
  disabled?: boolean;
  clearable?: boolean;
  [key: string]: unknown;
}

export function SearchableSelect({ options, value, onChange, placeholder = 'Выберите...', className, disabled, clearable }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.value === value);
  const filtered = search ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase())) : options;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        className={cn(
          'w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm',
          'hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        <span className={cn('truncate', !selected && 'text-gray-400')}>
          {selected?.label || placeholder}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {clearable && value && (
            <span onClick={e => { e.stopPropagation(); onChange(''); }} className="p-0.5 rounded hover:bg-gray-100">
              <X className="w-3 h-3 text-gray-400" />
            </span>
          )}
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </div>
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 flex flex-col">
          <div className="p-2 border-b">
            <div className="flex items-center gap-2 px-2 py-1 bg-gray-50 rounded">
              <Search className="w-3.5 h-3.5 text-gray-400" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Поиск..."
                className="flex-1 bg-transparent text-sm outline-none"
              />
            </div>
          </div>
          <div className="overflow-y-auto">
            {filtered.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); setSearch(''); }}
                className={cn(
                  'w-full text-left px-3 py-2 text-sm hover:bg-blue-50 hover:text-blue-700',
                  opt.value === value && 'bg-blue-50 text-blue-700 font-medium',
                )}
                style={{ paddingLeft: opt.indent ? `${12 + opt.indent * 16}px` : undefined }}
              >
                {opt.label}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">Ничего не найдено</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
