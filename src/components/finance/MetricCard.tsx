import { ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  trend?: { value: number; label?: string };
  className?: string;
  onClick?: () => void;
  loading?: boolean;
}

export function MetricCard({ title, value, subtitle, icon, trend, className, onClick, loading }: MetricCardProps) {
  if (loading) {
    return (
      <div className={cn('bg-white rounded-xl p-5 border border-gray-100 shadow-sm animate-pulse', className)}>
        <div className="h-4 bg-gray-200 rounded w-1/2 mb-3" />
        <div className="h-8 bg-gray-200 rounded w-3/4 mb-2" />
        <div className="h-3 bg-gray-100 rounded w-1/3" />
      </div>
    );
  }

  const trendPositive = (trend?.value ?? 0) >= 0;

  return (
    <div
      className={cn(
        'bg-white rounded-xl p-5 border border-gray-100 shadow-sm',
        onClick && 'cursor-pointer hover:shadow-md hover:border-blue-200 transition-all',
        className,
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm text-gray-500 font-medium">{title}</p>
        {icon && <span className="text-gray-400">{icon}</span>}
      </div>
      <p className="text-2xl font-bold text-gray-900 mb-1">{value}</p>
      {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
      {trend !== undefined && (
        <div className={cn('flex items-center gap-1 mt-2 text-xs font-medium', trendPositive ? 'text-green-600' : 'text-red-500')}>
          <span>{trendPositive ? '▲' : '▼'}</span>
          <span>{Math.abs(trend.value).toFixed(1)}% {trend.label || 'vs прошлый месяц'}</span>
        </div>
      )}
    </div>
  );
}
