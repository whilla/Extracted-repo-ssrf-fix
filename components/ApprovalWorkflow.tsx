'use client';

import React, { useState, useEffect } from 'react';

export interface ApprovalItem {
  id: string;
  content: string;
  platform: string;
  author: string;
  status: 'pending' | 'approved' | 'rejected' | 'revisions_requested';
  submittedAt: string;
  reviewer?: string;
  reviewNotes?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

interface ApprovalWorkflowProps {
  items: ApprovalItem[];
  onApprove: (id: string, notes?: string) => void;
  onReject: (id: string, notes: string) => void;
  onRequestRevisions: (id: string, notes: string) => void;
}

export function ApprovalWorkflow({ items, onApprove, onReject, onRequestRevisions }: ApprovalWorkflowProps) {
  const [selectedItem, setSelectedItem] = useState<ApprovalItem | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');

  const filteredItems = items.filter(item => 
    filter === 'all' || item.status === filter
  );

  const handleApprove = () => {
    if (selectedItem) {
      onApprove(selectedItem.id, reviewNotes || undefined);
      setSelectedItem(null);
      setReviewNotes('');
    }
  };

  const handleReject = () => {
    if (selectedItem && reviewNotes.trim()) {
      onReject(selectedItem.id, reviewNotes);
      setSelectedItem(null);
      setReviewNotes('');
    }
  };

  const handleRequestRevisions = () => {
    if (selectedItem && reviewNotes.trim()) {
      onRequestRevisions(selectedItem.id, reviewNotes);
      setSelectedItem(null);
      setReviewNotes('');
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'revisions_requested': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="flex h-full">
      {/* Items List */}
      <div className="w-80 border-r">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Approval Queue</h2>
          <div className="flex gap-2 mt-2">
            {(['all', 'pending', 'approved', 'rejected'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2 py-1 text-xs rounded ${filter === f ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
        
        <div className="overflow-y-auto h-[calc(100vh-140px)]">
          {filteredItems.map(item => (
            <div
              key={item.id}
              onClick={() => setSelectedItem(item)}
              className={`p-4 border-b cursor-pointer hover:bg-gray-50 ${selectedItem?.id === item.id ? 'bg-blue-50' : ''}`}
            >
              <div className="flex justify-between items-start mb-2">
                <span className={`px-2 py-0.5 text-xs rounded ${getPriorityColor(item.priority)}`}>
                  {item.priority}
                </span>
                <span className={`px-2 py-0.5 text-xs rounded ${getStatusColor(item.status)}`}>
                  {item.status.replace('_', ' ')}
                </span>
              </div>
              <p className="text-sm font-medium truncate">{item.content.substring(0, 60)}...</p>
              <p className="text-xs text-gray-500 mt-1">{item.platform} • {item.author}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Review Panel */}
      <div className="flex-1 p-6">
        {selectedItem ? (
          <div>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-semibold">Review Content</h3>
                <p className="text-sm text-gray-500">Submitted by {selectedItem.author} on {new Date(selectedItem.submittedAt).toLocaleDateString()}</p>
              </div>
              <span className={`px-3 py-1 text-sm rounded ${getPriorityColor(selectedItem.priority)}`}>
                {selectedItem.priority} priority
              </span>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg mb-4">
              <p className="whitespace-pre-wrap">{selectedItem.content}</p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Review Notes</label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                className="w-full p-3 border rounded-lg"
                rows={4}
                placeholder="Add your review notes..."
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleApprove}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
              >
                Approve
              </button>
              <button
                onClick={handleRequestRevisions}
                disabled={!reviewNotes.trim()}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
              >
                Request Revisions
              </button>
              <button
                onClick={handleReject}
                disabled={!reviewNotes.trim()}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            Select an item to review
          </div>
        )}
      </div>
    </div>
  );
}
