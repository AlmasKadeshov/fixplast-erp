import { MapPin } from 'lucide-react';
export function Checkin() {
  return <div className="flex flex-col items-center justify-center min-h-screen text-center p-8 bg-slate-900 text-white"><MapPin className="w-12 h-12 text-blue-400 mb-4" /><h2 className="text-xl font-semibold">Отметка на объекте</h2><p className="text-gray-400 mt-2">Отсканируйте QR-код</p></div>;
}
