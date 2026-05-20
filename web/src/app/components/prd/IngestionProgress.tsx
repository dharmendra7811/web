"use client";

import { useEffect, useState } from 'react';
import { getIngestStatus } from '@/lib/api';

interface IngestionProgressProps {
  projectId: string;
}

export default function IngestionProgress({ projectId }: IngestionProgressProps) {
  const [status, setStatus] = useState('idle'); // idle, extracting_features, generating_todos, done, error
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const checkStatus = async () => {
      try {
        const res = await getIngestStatus(projectId);
        setStatus(res.status);
        setProgress(res.progress);
        setMessage(res.message);
        
        if (res.status === 'done' || res.status === 'error' || res.status === 'idle') {
          if (intervalId) clearInterval(intervalId);
        }
      } catch (error) {
        console.error(error);
        setStatus('error');
        setMessage('Error checking ingestion status');
        if (intervalId) clearInterval(intervalId);
      }
    };

    // Run check immediately on mount
    checkStatus();

    intervalId = setInterval(checkStatus, 2000);
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [projectId]);


  return (
    <div className="border rounded p-4">
      <h2 className="text-lg font-semibold mb-2">Ingestion Progress</h2>
      <div className="mb-2">
        <span className="font-medium">Status:</span> {status}
      </div>
      <div className="mb-2">
        <span className="font-medium">Progress:</span> {progress}%
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div
          className="bg-blue-500 h-2.5 rounded-full"
          style={{ width: `${progress}%` }}
        ></div>
      </div>
      <p className="mt-1 text-sm text-gray-500">{message}</p>
    </div>
  );
}