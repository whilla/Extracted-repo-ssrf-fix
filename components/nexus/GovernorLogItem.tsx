'use client';

import { CheckCircle, XCircle } from 'lucide-react';

export interface GovernorLogEntry {
  id: string;
  timestamp: string;
  approved: boolean;
  score: number;
  feedback: string;
  issues: string[];
}

export function GovernorLogItem({ log }: { log: GovernorLogEntry }) {
  const statusId = `governor-status-${log.id}`;

  return (
    <article aria-labelledby={statusId} className={`p-2 rounded-lg border ${
      log.approved
        ? 'bg-green-500/5 border-green-500/20'
        : 'bg-red-500/5 border-red-500/20'
    }`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          {log.approved ? (
            <CheckCircle className="h-4 w-4 text-green-400" />
          ) : (
            <XCircle className="h-4 w-4 text-red-400" />
          )}
          <span className="sr-only">{log.approved ? 'Approved' : 'Rejected'}</span>
          <span id={statusId} className={`text-sm font-medium ${log.approved ? 'text-green-400' : 'text-red-400'}`}>
            {log.approved ? 'Approved' : 'Rejected'}
          </span>
        </div>
        <span className="text-xs text-gray-500">
          Score: {log.score}
        </span>
      </div>
      <p className="text-xs text-gray-400 truncate">{log.feedback}</p>
      {log.issues.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {log.issues.map((issue, i) => (
            <li key={i} className="text-xs text-red-400">- {issue}</li>
          ))}
        </ul>
      )}
      <p className="text-xs text-gray-500 mt-1">
        {new Date(log.timestamp).toLocaleTimeString()}
      </p>
    </article>
  );
}
