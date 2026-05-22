"use client";

import { useState } from 'react';
import { updateTodo, deleteTodo, syncTodoToRedmine, Todo } from '@/lib/api';

interface TodoItemProps {
  todo: Todo;
  featureId: string;
}

export default function TodoItem({ todo, featureId }: TodoItemProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(todo.title);
  const [detail, setDetail] = useState(todo.detail || '');
  const [status, setStatus] = useState(todo.status);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Handle todo update
  const handleUpdate = async () => {
    setSaving(true);
    try {
      await updateTodo(todo.id, {
        title,
        detail,
        status,
      });
      // In a real app, we would update the todo state locally
    } catch (error) {
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  // Handle todo deletion
  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteTodo(todo.id);
      // In a real app, we would remove the todo from the list
      alert('Todo deleted');
    } catch (error) {
      console.error(error);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="border rounded p-4 mb-2">
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1">
          {editing ? (
            <>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="border p-1 mb-1 w-full"
                autoFocus
              />
              <textarea
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                rows={2}
                className="border p-1 w-full mb-1"
              />
              <div className="flex space-x-2">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Todo['status'])}
                  className="border p-1"
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="done">Done</option>
                  <option value="blocked">Blocked</option>
                </select>
                <button
                  onClick={handleUpdate}
                  disabled={saving}
                  className={`bg-green-500 text-white px-3 py-1 rounded ${saving ? 'opacity-50' : ''} hover:bg-green-600`}
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <h4 className="text-md font-semibold">{todo.title}</h4>
              {todo.detail && <p className="text-gray-600">{todo.detail}</p>}
            </>
          )}
        </div>
        <div className="flex space-x-2">
          {!editing && !deleting && (
            <button
              onClick={() => setEditing(true)}
              className="text-blue-500 hover:text-blue-700"
            >
              Edit
            </button>
          )}
          {!editing && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className={`text-red-500 hover:text-red-700 ${deleting ? 'opacity-50' : ''}`}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          )}
          {!editing && todo.ticket_adapter === 'redmine' && (
            <button
              onClick={async () => {
                try {
                  await syncTodoToRedmine(todo.id);
                  alert('Todo synced to Redmine!');
                } catch (err: any) {
                  alert(`Sync failed: ${err.message}`);
                }
              }}
              className="text-orange-500 hover:text-orange-700"
            >
              Sync to Redmine
            </button>
          )}
        </div>
      </div>
      
      {!editing && (
        <div className="flex flex-wrap gap-2 mb-2">
          <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
            Status: 
            <span className={`font-medium ${status === 'done' ? 'text-green-600' : status === 'in_progress' ? 'text-yellow-600' : status === 'blocked' ? 'text-red-600' : 'text-gray-600'}`}>
              {status}
            </span>
          </span>
          {todo.entities.length > 0 && (
            <span className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded">
              Entities: {todo.entities.join(', ')}
            </span>
          )}
          {todo.ticket_id && (
            <span className="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded">
              Ticket: {todo.ticket_id} ({todo.ticket_adapter || ''})
            </span>
          )}
        </div>
      )}
    </div>
  );
}