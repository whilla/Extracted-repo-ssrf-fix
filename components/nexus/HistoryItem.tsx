'use client';

import { Copy } from 'lucide-react';

export interface HistoryEntry {
  id: string;
  content: string;
  score: number;
  platform: string;
  timestamp: string;
  success: boolean;
}

export function HistoryItem({ entry, onCopy }: { entry: HistoryEntry; onCopy: (text: string) => void }) {
  return (
    <div className={`p-3 bg-black/40 rounded-lg border ${
      entry.success ? 'border-gray-700/30' : 'border-red-500/20'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 bg-gray-700/50 rounded text-gray-300">
            {entry.platform}
          </span>
          <span className={`text-sm font-medium ${
            entry.score >= 70 ? 'text-green-400' :
            entry.score >= 50 ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {entry.score}
          </span>
        </div>
        <button
          onClick={() => onCopy(entry.content)}
          aria-label="Copy content"
          className="text-gray-400 hover:text-white transition-colors"
        >
          <Copy className="h-4 w-4" />
        </button>
      </div>
      <p className="text-sm text-gray-300 line-clamp-2">{entry.content || 'Empty content'}</p>
      <p className="text-xs text-gray-500 mt-2">
        {(() => {
          const date = new Date(entry.timestamp);
          return isNaN(date.getTime()) ? 'Invalid date' : date.toLocaleString();
        })()}
      </p>
    </div>
  );
}
