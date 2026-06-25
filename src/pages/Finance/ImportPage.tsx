import { Upload } from 'lucide-react';

export function ImportPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8">
      <Upload className="w-12 h-12 text-gray-300 mb-4" />
      <h2 className="text-xl font-semibold text-gray-700 mb-2">Импорт банковской выписки</h2>
      <p className="text-gray-500 max-w-sm">
        Загрузите файл выписки из Halyk Bank, Kaspi или 1С для автоматической категоризации транзакций.
      </p>
      <p className="mt-4 text-sm text-amber-600 bg-amber-50 px-4 py-2 rounded-lg">
        Страница в разработке — подключение к Firebase актуально
      </p>
    </div>
  );
}
