"use client";

import Link from 'next/link';
import { useEffect, useState, use } from 'react';
import UploadZone from '@/app/components/prd/UploadZone';
import IngestionProgress from '@/app/components/prd/IngestionProgress';
import FeatureList from '@/app/components/features/FeatureList';
import ChatPanel from '@/app/components/chat/ChatPanel';
import GraphView from '@/app/components/graph/GraphView';
import ViewToggle from '@/app/components/layout/ViewToggle';
import ProjectHeader from '@/app/components/layout/ProjectHeader';
import { getProject, updateProjectPRD } from '@/lib/api';

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'graph'>('list');
  const [editing, setEditing] = useState(false);
  const [prdText, setPrdText] = useState('');

  useEffect(() => {
    loadProject();
  }, [id]);

  const loadProject = async () => {
    setLoading(true);
    try {
      const data = await getProject(id);
      setProject(data);
      setPrdText(data.prd_text || '');
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handlePRDChange = (text: string) => {
    setPrdText(text);
  };

  const handlePRDSubmit = async () => {
    setLoading(true);
    try {
      await updateProjectPRD(id, prdText);
      await loadProject(); // Reload to get updated summary
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !project) {
    return <div className="container mx-auto p-4">Loading...</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <ProjectHeader project={project} onUpdate={setEditing} />
      
      <div className="mt-4 flex flex-col md:flex-row gap-4">
        {/* Sidebar */}
        <div className="w-full md:w-1/4 space-y-4">
          <UploadZone 
            projectId={id} 
            onPRDChange={handlePRDChange} 
            onPRDSubmit={handlePRDSubmit}
            editing={editing}
          />
          {!editing && <IngestionProgress projectId={id} />}
          <FeatureList projectId={id} />
        </div>
        
        {/* Main view */}
        <div className="w-full md:w-1/2 space-y-4">
          <ViewToggle 
            view={view} 
            onViewChange={setView} 
          />
          {view === 'list' ? (
            <>
              {/* Feature list would be in sidebar in list view */}
              <div className="bg-gray-50 p-4 rounded">
                <h2 className="text-lg font-semibold mb-2">Project Details</h2>
                <p className="text-gray-600">{project.summary || 'No summary available'}</p>
              </div>
            </>
          ) : (
            <GraphView projectId={id} />
          )}
        </div>
        
        {/* Chat panel */}
        <div className="w-full md:w-1/2 space-y-4">
          <ChatPanel projectId={id} />
        </div>
      </div>
    </div>
  );
}