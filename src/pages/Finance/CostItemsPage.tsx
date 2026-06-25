import { Tag } from 'lucide-react';

export function CostItemsPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8">
      <Tag className="w-12 h-12 text-gray-300 mb-4" />
      <h2 className="text-xl font-semibold text-gray-700 mb-2">Статьи затрат</h2>
      <p className="text-gray-500">Справочник статей расходов и доходов</p>
    </div>
  );
}
