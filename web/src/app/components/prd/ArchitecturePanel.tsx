"use client";

import { useState, useEffect } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface ArchitecturePanelProps {
  project: any;
  theme?: 'light' | 'dark';
}

export default function ArchitecturePanel({ project, theme = 'dark' }: ArchitecturePanelProps) {
  const [activeTab, setActiveTab] = useState<'schema' | 'api' | 'arch'>('schema');
  const [liveProject, setLiveProject] = useState(project);
  const [polling, setPolling] = useState(false);

  const dataModelDraft = liveProject.data_model_draft || [];
  const apiSurfaceDraft = liveProject.api_surface_draft || [];
  const integrationsDraft = liveProject.integrations_draft || [];
  const reviewRisks = liveProject.review_risks || [];
  const reviewAssumptions = liveProject.review_assumptions || [];
  const modulesAnalyzed = liveProject.modules_analyzed || [];

  // Poll for architecture re-draft to complete (after clarify, re-draft runs in background ~30s)
  useEffect(() => {
    if (liveProject.review_state !== 'answered') return;

    // If data exists already, no need to poll
    if (dataModelDraft.length > 0) return;

    setPolling(true);
    let attempts = 0;
    const maxAttempts = 20; // poll for up to 60s

    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`${API_URL}/api/projects/${liveProject.id}`);
        if (!res.ok) return;
        const data = await res.json();
        const fresh = data.project || data;
        if (fresh.data_model_draft && fresh.data_model_draft.length > 0) {
          setLiveProject(fresh);
          setPolling(false);
          clearInterval(interval);
        }
      } catch (_) {}

      if (attempts >= maxAttempts) {
        setPolling(false);
        clearInterval(interval);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [liveProject.id, liveProject.review_state]);

  // Sync if parent project updates (e.g. after page-level loadProject)
  useEffect(() => {
    setLiveProject(project);
  }, [project]);

  const getConfidenceBadgeColor = (confidence: number) => {
    if (confidence >= 0.85) return 'text-[#3fb950] border-[#3fb950]/30 bg-[#3fb950]/5';
    if (confidence >= 0.6) return 'text-[#d29922] border-[#d29922]/30 bg-[#d29922]/5';
    return 'text-[#f85149] border-[#f85149]/30 bg-[#f85149]/5';
  };

  const isEmpty = dataModelDraft.length === 0 && apiSurfaceDraft.length === 0 && reviewRisks.length === 0;

  return (
    <div className="flex flex-col h-full font-mono overflow-hidden">
      {/* Header */}
      <div className={`px-3 py-2 border-b shrink-0 ${theme === 'dark' ? 'border-[#30363d] bg-[#161b22]' : 'border-[#d0d7de] bg-[#f6f8fa]'}`}>
        <div className="flex items-center justify-between">
          <span className={`text-[10px] uppercase font-bold tracking-wider ${theme === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]'}`}>
            // Architecture Foundation
          </span>
          <div className="flex items-center gap-1.5">
            {modulesAnalyzed.length > 0 && (
              <span className={`text-[8px] px-1.5 border rounded ${theme === 'dark' ? 'border-[#30363d] text-[#8b949e] bg-[#0d1117]' : 'border-[#d0d7de] text-[#57606a] bg-[#ffffff]'}`}>
                {modulesAnalyzed.length} modules
              </span>
            )}
            {liveProject.review_state === 'answered' && (
              <span className={`text-[8px] uppercase font-bold px-1.5 border rounded ${theme === 'dark' ? 'text-[#3fb950] border-[#3fb950]/30 bg-[#3fb950]/5' : 'text-[#2da44e] border-[#2da44e]/30 bg-[#2da44e]/5'}`}>
                FINAL
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className={`flex border-b text-[9px] uppercase font-bold tracking-wider shrink-0 ${theme === 'dark' ? 'border-[#30363d]' : 'border-[#d0d7de]'}`}>
        {(['schema', 'api', 'arch'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-1.5 text-center border-r transition-colors last:border-r-0 ${
              activeTab === tab
                ? (theme === 'dark' ? 'bg-[#0d1117] text-white border-b-2 border-b-[#58a6ff] border-r-[#30363d]' : 'bg-[#ffffff] text-black border-b-2 border-b-[#0969da] border-r-[#d0d7de]')
                : (theme === 'dark' ? 'text-[#8b949e] border-r-[#30363d] hover:bg-[#21262d]' : 'text-[#57606a] border-r-[#d0d7de] hover:bg-[#e5e7eb]')
            }`}
          >
            {tab === 'schema' ? `Schema (${dataModelDraft.length})` : tab === 'api' ? `API (${apiSurfaceDraft.length})` : `Risks (${reviewRisks.length})`}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {polling && (
          <div className={`px-3 py-2 text-[10px] border-b flex items-center gap-2 ${theme === 'dark' ? 'border-[#30363d] bg-[#161b22] text-[#d29922]' : 'border-[#d0d7de] bg-[#fff8e1] text-[#9a6700]'}`}>
            <span className="animate-pulse">●</span>
            <span>Re-drafting architecture with your answers...</span>
          </div>
        )}

        {isEmpty && !polling ? (
          <div className={`p-4 text-center text-xs ${theme === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]'}`}>
            No architecture data yet. Run a PRD review to generate the foundation.
          </div>
        ) : (
          <>
            {/* SCHEMA TAB */}
            {activeTab === 'schema' && (
              <div className="space-y-2 p-2">
                {dataModelDraft.length === 0 ? (
                  <div className={`p-3 text-center text-xs border rounded ${theme === 'dark' ? 'border-[#30363d] text-[#8b949e]' : 'border-[#d0d7de] text-[#57606a]'}`}>
                    {polling ? 'Generating...' : 'No schema drafted.'}
                  </div>
                ) : dataModelDraft.map((table: any, idx: number) => (
                  <div key={idx} className={`p-2.5 border rounded ${theme === 'dark' ? 'bg-[#0d1117] border-[#30363d]' : 'bg-[#ffffff] border-[#d0d7de]'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-bold ${theme === 'dark' ? 'text-[#c9d1d9]' : 'text-[#24292f]'}`}>
                        {table.table}
                      </span>
                      {table.confidence && (
                        <span className={`text-[7px] px-1 border rounded uppercase font-bold ${getConfidenceBadgeColor(table.confidence)}`}>
                          {Math.round(table.confidence * 100)}%
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {table.columns?.map((col: string, ci: number) => (
                        <span key={ci} className={`text-[8px] px-1 border rounded ${
                          col === 'id' || col.endsWith('_id')
                            ? (theme === 'dark' ? 'bg-[#1f6feb]/10 border-[#1f6feb]/30 text-[#58a6ff]' : 'bg-[#0969da]/10 border-[#0969da]/30 text-[#0969da]')
                            : (theme === 'dark' ? 'bg-[#161b22] border-[#30363d] text-[#c9d1d9]' : 'bg-[#f6f8fa] border-[#d0d7de] text-[#24292f]')
                        }`}>
                          {col}
                        </span>
                      ))}
                    </div>
                    {table.relationships?.length > 0 && (
                      <div className="space-y-0.5">
                        {table.relationships.map((rel: string, ri: number) => (
                          <div key={ri} className={`text-[9px] ${theme === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]'}`}>
                            ↳ {rel}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* API TAB */}
            {activeTab === 'api' && (
              <div className="p-2">
                {apiSurfaceDraft.length === 0 ? (
                  <div className={`p-3 text-center text-xs border rounded ${theme === 'dark' ? 'border-[#30363d] text-[#8b949e]' : 'border-[#d0d7de] text-[#57606a]'}`}>
                    {polling ? 'Generating...' : 'No endpoints drafted.'}
                  </div>
                ) : (
                  <div className={`border rounded divide-y overflow-hidden ${theme === 'dark' ? 'border-[#30363d] divide-[#30363d]' : 'border-[#d0d7de] divide-[#d0d7de]'}`}>
                    {apiSurfaceDraft.map((ep: any, idx: number) => (
                      <div key={idx} className={`px-2.5 py-2 flex items-center justify-between gap-2 ${theme === 'dark' ? 'bg-[#0d1117]' : 'bg-[#ffffff]'}`}>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`text-[8px] uppercase font-bold px-1 border rounded shrink-0 ${
                            ep.method === 'POST' ? 'text-[#3fb950] border-[#3fb950]/30 bg-[#3fb950]/5' :
                            ep.method === 'GET' ? 'text-[#58a6ff] border-[#58a6ff]/30 bg-[#58a6ff]/5' :
                            ep.method === 'PUT' || ep.method === 'PATCH' ? 'text-[#d29922] border-[#d29922]/30 bg-[#d29922]/5' :
                            'text-[#f85149] border-[#f85149]/30 bg-[#f85149]/5'
                          }`}>
                            {ep.method}
                          </span>
                          <span className={`text-[9px] truncate ${theme === 'dark' ? 'text-[#c9d1d9]' : 'text-[#24292f]'}`}>
                            {ep.endpoint}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {ep.module && (
                            <span className={`text-[8px] ${theme === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]'}`}>
                              {ep.module}
                            </span>
                          )}
                          {ep.auth_required !== undefined && (
                            <span className={`text-[7px] uppercase font-bold px-1 border rounded ${
                              ep.auth_required
                                ? (theme === 'dark' ? 'text-[#a371f7] border-[#a371f7]/30 bg-[#a371f7]/5' : 'text-[#6f42c1] border-[#6f42c1]/30 bg-[#6f42c1]/5')
                                : (theme === 'dark' ? 'text-[#8b949e] border-[#30363d]' : 'text-[#57606a] border-[#d0d7de]')
                            }`}>
                              {ep.auth_required ? '🔒' : 'pub'}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ARCH / RISKS + ASSUMPTIONS TAB */}
            {activeTab === 'arch' && (
              <div className="space-y-3 p-2">
                {/* Integrations */}
                {integrationsDraft.length > 0 && (
                  <div className="space-y-1.5">
                    <div className={`text-[9px] uppercase font-bold ${theme === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]'}`}>
                      // Integrations
                    </div>
                    {integrationsDraft.map((integ: any, idx: number) => (
                      <div key={idx} className={`p-2 border rounded ${theme === 'dark' ? 'bg-[#0d1117] border-[#30363d]' : 'bg-[#ffffff] border-[#d0d7de]'}`}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className={`text-[10px] font-bold ${theme === 'dark' ? 'text-[#c9d1d9]' : 'text-[#24292f]'}`}>{integ.service}</span>
                          {integ.confidence && (
                            <span className={`text-[7px] px-1 border rounded uppercase ${getConfidenceBadgeColor(integ.confidence)}`}>
                              {Math.round(integ.confidence * 100)}%
                            </span>
                          )}
                        </div>
                        <p className={`text-[9px] ${theme === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]'}`}>{integ.usage}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Risks */}
                {reviewRisks.length > 0 && (
                  <div className="space-y-1.5">
                    <div className={`text-[9px] uppercase font-bold ${theme === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]'}`}>
                      // Risk Register
                    </div>
                    {reviewRisks.map((risk: any, idx: number) => (
                      <div key={idx} className={`p-2 border-l-4 border-l-[#f85149] border rounded ${theme === 'dark' ? 'bg-[#0d1117] border-y-[#30363d] border-r-[#30363d]' : 'bg-[#ffffff] border-y-[#d0d7de] border-r-[#d0d7de]'}`}>
                        <span className={`text-[8px] font-bold uppercase block mb-0.5 ${theme === 'dark' ? 'text-[#f85149]' : 'text-[#cf222e]'}`}>[{risk.area}]</span>
                        <p className={`text-[9px] font-sans ${theme === 'dark' ? 'text-[#c9d1d9]' : 'text-[#24292f]'}`}>{risk.description}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Assumptions */}
                {reviewAssumptions.length > 0 && (
                  <div className="space-y-1.5">
                    <div className={`text-[9px] uppercase font-bold ${theme === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]'}`}>
                      // Confirmed Assumptions
                    </div>
                    {reviewAssumptions.map((ass: any, idx: number) => (
                      <div key={idx} className={`p-2 border rounded ${theme === 'dark' ? 'bg-[#0d1117] border-[#30363d]' : 'bg-[#ffffff] border-[#d0d7de]'}`}>
                        <span className={`text-[9px] font-bold block mb-0.5 ${theme === 'dark' ? 'text-[#58a6ff]' : 'text-[#0969da]'}`}>✓ {ass.assertion}</span>
                        <p className={`text-[9px] font-sans ${theme === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]'}`}>{ass.reasoning}</p>
                      </div>
                    ))}
                  </div>
                )}

                {reviewRisks.length === 0 && reviewAssumptions.length === 0 && integrationsDraft.length === 0 && (
                  <div className={`p-3 text-center text-xs ${theme === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]'}`}>
                    {polling ? 'Generating...' : 'No architectural data yet.'}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
