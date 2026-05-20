"use client";

import { useEffect, useState } from 'react';
import { getFeatures } from '@/lib/api';
import FeatureCard from './FeatureCard';

interface FeatureListProps {
  projectId: string;
}

export default function FeatureList({ projectId }: FeatureListProps) {
  const [features, setFeatures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFeatures();
    
    const handleUpdate = () => {
      loadFeatures();
    };
    window.addEventListener('prd-updated', handleUpdate);
    return () => {
      window.removeEventListener('prd-updated', handleUpdate);
    };
  }, [projectId]);

  const loadFeatures = async () => {
    setLoading(true);
    try {
      const data = await getFeatures(projectId);
      setFeatures(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border rounded p-4">
      <h2 className="text-lg font-semibold mb-2">Features</h2>
      {loading ? (
        <p>Loading features...</p>
      ) : features.length === 0 ? (
        <p>No features yet. Ingest PRD to generate features.</p>
      ) : (
        <div className="space-y-2">
          {features.map((feature) => (
            <FeatureCard key={feature.id} feature={feature} />
          ))}
        </div>
      )}
    </div>
  );
}