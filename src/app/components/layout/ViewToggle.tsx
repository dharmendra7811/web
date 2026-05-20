"use client";

interface ViewToggleProps {
  view: 'list' | 'graph';
  onViewChange: (view: 'list' | 'graph') => void;
}

export default function ViewToggle({ view, onViewChange }: ViewToggleProps) {
  return (
    <div className="flex bg-gray-100 p-1 rounded-md max-w-xs mb-4">
      <button
        onClick={() => onViewChange('list')}
        className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded transition ${
          view === 'list' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        List View
      </button>
      <button
        onClick={() => onViewChange('graph')}
        className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded transition ${
          view === 'graph' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        Graph View
      </button>
    </div>
  );
}
