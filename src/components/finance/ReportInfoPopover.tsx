import { useState, ReactNode } from 'react';
import { Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ReportInfoPopoverProps {
  title?: string;
  children?: ReactNode;
  items?: Array<{ label: string; text: string }>;
}

export function ReportInfoPopover({ title, children, items }: ReportInfoPopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-flex">
      <button
        onClick={() => setOpen(v => !v)}
        className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100"
      >
        <Info className="w-4 h-4" />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute left-0 top-8 z-20 w-72 bg-white rounded-xl border border-gray-200 shadow-lg p-4"
            >
              {title && <p className="font-semibold text-gray-800 mb-2">{title}</p>}
              <div className="text-sm text-gray-600 space-y-1">
                {items?.map((item, i) => (
                  <div key={i}><span className="font-medium">{item.label}:</span> {item.text}</div>
                ))}
                {children}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
