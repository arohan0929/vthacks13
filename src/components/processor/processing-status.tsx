"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";

interface ProcessingJob {
  id: string;
  project_id: string;
  document_id?: string;
  job_type: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  total_documents: number;
  processed_documents: number;
  total_chunks: number;
  processed_chunks: number;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  duration_seconds?: number;
}

interface ProcessingStatus {
  project_id: string;
  is_processing: boolean;
  processing_progress: number;
  active_jobs: ProcessingJob[];
  recent_jobs: ProcessingJob[];
  stats: {
    total_documents: number;
    total_chunks: number;
    total_tokens: number;
    avg_chunk_size: number;
    processed_documents: number;
    last_processing_date?: string;
  };
}

interface ProcessingStatusProps {
  projectId: string;
  authToken: string;
  className?: string;
}

export function ProcessingStatus({
  projectId,
  authToken,
  className = "",
}: ProcessingStatusProps) {
  const [status, setStatus] = useState<ProcessingStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(
        `/api/projects/${projectId}/processing-status`,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch processing status");
      }

      const data = await response.json();
      setStatus(data);
    } catch (error) {
      console.error("Error fetching processing status:", error);
      setError(
        error instanceof Error ? error.message : "Failed to fetch status"
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    // Poll for updates every 5 seconds if there are active jobs
    const interval = setInterval(() => {
      if (status?.is_processing) {
        fetchStatus();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [projectId, authToken, status?.is_processing]);

  const getStatusIcon = (jobStatus: string) => {
    switch (jobStatus) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-600" />;
      case "running":
        return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusBadgeVariant = (jobStatus: string) => {
    switch (jobStatus) {
      case "completed":
        return "default";
      case "failed":
        return "destructive";
      case "running":
        return "secondary";
      case "pending":
        return "outline";
      default:
        return "outline";
    }
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Processing Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Processing Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <p className="text-red-600 mb-4">{error}</p>
            <Button onClick={fetchStatus} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!status) {
    return null;
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Processing Status
              {status.is_processing && (
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              )}
            </CardTitle>
            <CardDescription>
              Document processing and embedding status
            </CardDescription>
          </div>
          <Button onClick={fetchStatus} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Overall Progress</span>
            <span>{Math.round(status.processing_progress)}%</span>
          </div>
          <Progress value={status.processing_progress} className="h-2" />
          <div className="text-xs text-gray-600">
            {status.stats.processed_documents} of {status.stats.total_documents}{" "}
            documents processed
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-gray-600">Total Chunks</div>
            <div className="font-semibold">
              {status.stats.total_chunks.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-gray-600">Total Tokens</div>
            <div className="font-semibold">
              {status.stats.total_tokens?.toLocaleString() || "N/A"}
            </div>
          </div>
          <div>
            <div className="text-gray-600">Avg Chunk Size</div>
            <div className="font-semibold">
              {Math.round(status.stats.avg_chunk_size || 0)} tokens
            </div>
          </div>
          <div>
            <div className="text-gray-600">Last Processed</div>
            <div className="font-semibold">
              {status.stats.last_processing_date
                ? new Date(
                    status.stats.last_processing_date
                  ).toLocaleDateString()
                : "Never"}
            </div>
          </div>
        </div>

        {/* Active Jobs */}
        {status.active_jobs.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-medium text-sm">Active Processing</h4>
            {status.active_jobs.map((job) => (
              <div key={job.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(job.status)}
                    <span className="text-sm font-medium">
                      {job.job_type === "full_pipeline"
                        ? "Document Processing"
                        : job.job_type}
                    </span>
                  </div>
                  <Badge variant={getStatusBadgeVariant(job.status)}>
                    {job.status}
                  </Badge>
                </div>
                {job.total_chunks > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>Chunks</span>
                      <span>
                        {job.processed_chunks} / {job.total_chunks}
                      </span>
                    </div>
                    <Progress
                      value={(job.processed_chunks / job.total_chunks) * 100}
                      className="h-1"
                    />
                  </div>
                )}
                {job.error_message && (
                  <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                    {job.error_message}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Recent Jobs */}
        {status.recent_jobs.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-medium text-sm">Recent Activity</h4>
            <div className="space-y-2">
              {status.recent_jobs.slice(0, 3).map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2">
                    {getStatusIcon(job.status)}
                    <span className="text-gray-700">
                      {job.job_type === "full_pipeline"
                        ? "Document Processing"
                        : job.job_type}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={getStatusBadgeVariant(job.status)}
                      size="sm"
                    >
                      {job.status}
                    </Badge>
                    {job.duration_seconds && (
                      <span className="text-xs text-gray-500">
                        {Math.round(job.duration_seconds)}s
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No Processing Message */}
        {!status.is_processing &&
          status.active_jobs.length === 0 &&
          status.recent_jobs.length === 0 && (
            <div className="text-center py-4 text-gray-500">
              <p className="text-sm">No processing activity yet</p>
              <p className="text-xs">Upload documents to start processing</p>
            </div>
          )}
      </CardContent>
    </Card>
  );
}
