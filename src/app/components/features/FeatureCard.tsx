"use client";

import { useState, useEffect } from 'react';
import { updateFeature, deleteFeature, Feature } from '@/lib/api';
import TodoItem from '@/app/components/features/TodoItem';

interface FeatureCardProps {
  feature: Feature;
}

export default function FeatureCard({ feature }: FeatureCardProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(feature.title);
  const [description, setDescription] = useState(feature.description || '');
  const [todos, setTodos] = useState<any[]>([]);
  const [loadingTodos, setLoadingTodos] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Load todos for this feature
  const loadTodos = async () => {
    setLoadingTodos(true);
    try {
      const data = await fetchTodos(feature.id);
      setTodos(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingTodos(false);
    }
  };

  // Fetch todos from API
  const fetchTodos = async (featureId: string) => {
    const res = await fetch(`/api/features/${featureId}/todos`);
    if (!res.ok) {
      throw new Error('Failed to fetch todos');
    }
    return res.json();
  };

  // Handle feature update
  const handleUpdate = async () => {
    setEditing(true);
    try {
      await updateFeature(feature.id, {
        title,
        description,
      });
      // In a real app, we would update the feature state locally
    } catch (error) {
      console.error(error);
    } finally {
      setEditing(false);
    }
  };

  // Handle feature deletion
  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteFeature(feature.id);
      // In a real app, we would remove the feature from the list
      // For now, we'll just show a success message
      alert('Feature deleted');
    } catch (error) {
      console.error(error);
    } finally {
      setDeleting(false);
    }
  };

  // Load todos on mount
  useEffect(() => {
    loadTodos();
  }, [feature.id]);

  return (
    <div className="border rounded p-4 mb-4">
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-lg font-semibold">
          {editing ? (
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="border p-1"
              autoFocus
            />
          ) : (
            feature.title
          )}
        </h3>
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
          {editing && (
            <>
              <button
                onClick={handleUpdate}
                className="text-green-500 hover:text-green-700 mr-2"
              >
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
      
      {!editing && feature.description && (
        <p className="text-gray-600 mb-2">{feature.description}</p>
      )}
      
      {!editing && (
        <div className="flex flex-wrap gap-2 mb-2">
          <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
            Status: {feature.status}
          </span>
          {feature.actors.length > 0 && (
            <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
              Actors: {feature.actors.join(', ')}
            </span>
          )}
          {feature.entities.length > 0 && (
            <span className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded">
              Entities: {feature.entities.join(', ')}
            </span>
          )}
        </div>
      )}
      
      <div className="border-t pt-4">
        <h4 className="text-md font-semibold mb-2">Todos</h4>
        {loadingTodos ? (
          <p>Loading todos...</p>
        ) : todos.length === 0 ? (
          <p className="text-gray-500">No todos yet.</p>
        ) : (
          <div className="space-y-2">
            {todos.map((todo) => (
              <TodoItem key={todo.id} todo={todo} featureId={feature.id} />
            ))}
          </div>
        )}
        
        {/* Button to add new todo */}
        <div className="mt-4">
          <button
            onClick={() => {
              // In a real app, this would open a modal or form to add a todo
              alert('Add todo functionality would go here');
            }}
            className="bg-gray-500 text-white px-3 py-1 rounded hover:bg-gray-600"
          >
            Add Todo
          </button>
        </div>
      </div>
    </div>
  );
}