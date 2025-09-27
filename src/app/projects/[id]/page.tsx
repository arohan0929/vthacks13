'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store/auth-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ArrowLeft,
  FileText,
  Shield,
  ExternalLink,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import { GoogleDrivePicker } from '@/components/processor/google-drive-picker';
import { Project, Document } from '@/lib/db/types';

interface ProjectData {
  project: Project;
  documents: Document[];
  compliance: {
    totalFrameworks: number;
    averageScore: number;
    highPriorityGaps: number;
    lastAssessmentDate?: Date;
    frameworks: Array<{
      id: string;
      name: string;
      score?: number;
      confidence: number;
      gapCount: number;
    }>;
  };
  stats: {
    documentCount: number;
    frameworkCount: number;
    lastAssessmentDate?: Date;
    latestScore?: number;
  };
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user, loading, isInitialized } = useAuthStore();
  const [projectData, setProjectData] = useState<ProjectData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    // Only redirect if auth is fully initialized and confirmed no user
    if (isInitialized && !loading && !user) {
      router.push('/login');
      return;
    }

    // Only fetch data if we have a user
    if (user && isInitialized) {
      fetchProjectData();
    }
  }, [user, loading, isInitialized, router, id]);

  const fetchProjectData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const token = await user?.getIdToken();
      if (!token) {
        throw new Error('No authentication token');
      }

      const response = await fetch(`/api/projects/${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Project not found');
        }
        throw new Error(`Failed to fetch project: ${response.statusText}`);
      }

      const data = await response.json();
      setProjectData(data);
    } catch (error) {
      console.error('Error fetching project:', error);
      setError(error instanceof Error ? error.message : 'Failed to load project');
    } finally {
      setIsLoading(false);
    }
  };

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSelectDriveFile = async (fileId: string) => {
    try {
      const token = await user?.getIdToken();
      if (!token) throw new Error('No authentication token');

      const response = await fetch(`/api/projects/${id}/documents`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ driveFileId: fileId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to link document');
      }

      // Refresh project data to show new document
      await fetchProjectData();
    } catch (error) {
      console.error('Error linking document:', error);
      setError(error instanceof Error ? error.message : 'Failed to link document');
    }
  };

  const handleSyncDocuments = async () => {
    try {
      setIsSyncing(true);
      setError(null);

      const token = await user?.getIdToken();
      if (!token) throw new Error('No authentication token');

      const response = await fetch(`/api/projects/${id}/sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to sync documents');
      }

      const syncResult = await response.json();

      // Refresh project data to show updated information
      await fetchProjectData();

      // Show success message if changes were found
      if (syncResult.changedDocuments > 0) {
        // In a real app, you'd show a toast notification here
        console.log(`Sync completed: ${syncResult.changedDocuments} documents updated`);
      }
    } catch (error) {
      console.error('Error syncing documents:', error);
      setError(error instanceof Error ? error.message : 'Failed to sync documents');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAnalyzeProject = async () => {
    try {
      setIsAnalyzing(true);
      setError(null);

      const token = await user?.getIdToken();
      if (!token) throw new Error('No authentication token');

      const response = await fetch(`/api/projects/${id}/analyze`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to analyze project');
      }

      const analysisResult = await response.json();

      // Refresh project data to show analysis results
      await fetchProjectData();

      // In a real app, you'd show detailed analysis results in a modal or new page
      console.log('Analysis completed:', analysisResult);
    } catch (error) {
      console.error('Error analyzing project:', error);
      setError(error instanceof Error ? error.message : 'Failed to analyze project');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'completed':
        return 'default';
      case 'analyzing':
        return 'secondary';
      case 'draft':
      default:
        return 'outline';
    }
  };

  if (loading || !isInitialized || isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Skeleton className="h-8 w-16" />
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
        </div>

        <div className="space-y-6">
          <Skeleton className="h-12 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Error</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => router.push('/projects')}>
              Back to Projects
            </Button>
            <Button onClick={fetchProjectData} variant="outline">
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!projectData) {
    return null;
  }

  const { project, documents, compliance, stats } = projectData;

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/projects')}
          className="flex items-center gap-2"
        >
          <ArrowLeft size={16} />
          Projects
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-gray-900">{project.name}</h1>
            <Badge variant={getStatusBadgeVariant(project.status)}>
              {project.status}
            </Badge>
          </div>
          <p className="text-gray-600">
            {project.description || 'No description provided'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleSyncDocuments}
            variant="ghost"
            size="sm"
            disabled={isSyncing || documents.length === 0}
            className="flex items-center gap-2"
          >
            <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
            {isSyncing ? 'Syncing...' : 'Sync'}
          </Button>
          <GoogleDrivePicker
            onSelectFile={handleSelectDriveFile}
            selectedFiles={documents.map(doc => doc.drive_file_id)}
            disabled={isAnalyzing}
          />
          <Button
            onClick={handleAnalyzeProject}
            disabled={isAnalyzing || documents.length === 0}
            className="flex items-center gap-2"
          >
            {isAnalyzing ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Shield size={16} />
                Analyze
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.documentCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Frameworks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{compliance.totalFrameworks}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Compliance Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {compliance.averageScore > 0 ? `${Math.round(compliance.averageScore)}%` : 'N/A'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">High Priority Gaps</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{compliance.highPriorityGaps}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <FileText size={16} />
            Overview
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex items-center gap-2">
            <FileText size={16} />
            Documents
          </TabsTrigger>
          <TabsTrigger value="compliance" className="flex items-center gap-2">
            <Shield size={16} />
            Compliance
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Project Information */}
            <Card>
              <CardHeader>
                <CardTitle>Project Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-600">Created</label>
                  <p className="text-gray-900">
                    {new Date(project.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Last Updated</label>
                  <p className="text-gray-900">
                    {new Date(project.updated_at).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Status</label>
                  <p className="text-gray-900 capitalize">{project.status}</p>
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                {compliance.lastAssessmentDate ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Shield size={16} className="text-blue-600" />
                      <span>Last compliance assessment</span>
                      <span className="text-gray-500">
                        {new Date(compliance.lastAssessmentDate).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <AlertTriangle size={32} className="mx-auto mb-2" />
                    <p>No activity yet</p>
                    <p className="text-sm">Link documents and run analysis to get started</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Linked Documents</CardTitle>
                  <CardDescription>
                    Google Drive files linked to this project
                  </CardDescription>
                </div>
                <GoogleDrivePicker
                  onSelectFile={handleSelectDriveFile}
                  selectedFiles={documents.map(doc => doc.drive_file_id)}
                />
              </div>
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <div className="text-center py-12">
                  <FileText size={48} className="mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No documents linked
                  </h3>
                  <p className="text-gray-600 mb-4">
                    Link Google Drive documents to analyze compliance requirements
                  </p>
                  <GoogleDrivePicker
                    onSelectFile={handleSelectDriveFile}
                    selectedFiles={documents.map(doc => doc.drive_file_id)}
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Last Modified</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileText size={16} className="text-blue-600" />
                            <span className="font-medium">{doc.file_name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{doc.file_type}</Badge>
                        </TableCell>
                        <TableCell>
                          {doc.last_modified
                            ? new Date(doc.last_modified).toLocaleDateString()
                            : 'Unknown'
                          }
                        </TableCell>
                        <TableCell>
                          {doc.last_analyzed ? (
                            <Badge variant="secondary">Analyzed</Badge>
                          ) : (
                            <Badge variant="outline">Pending</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(doc.drive_url || '', '_blank')}
                          >
                            <ExternalLink size={14} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Compliance Tab */}
        <TabsContent value="compliance" className="mt-6">
          <div className="space-y-6">
            {compliance.totalFrameworks === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <Shield size={48} className="mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No compliance frameworks detected
                  </h3>
                  <p className="text-gray-600 mb-4">
                    Link documents and run analysis to identify applicable compliance frameworks
                  </p>
                  <Button onClick={handleAnalyzeProject} className="flex items-center gap-2">
                    <Shield size={16} />
                    Start Analysis
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {compliance.frameworks.map((framework) => (
                  <Card key={framework.id}>
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-lg">{framework.name}</CardTitle>
                          <CardDescription>
                            Confidence: {Math.round(framework.confidence * 100)}%
                          </CardDescription>
                        </div>
                        {framework.score !== undefined && (
                          <Badge variant="secondary">
                            {Math.round(framework.score)}% complete
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {framework.score !== undefined && (
                        <div className="mb-4">
                          <div className="flex justify-between text-sm mb-1">
                            <span>Compliance Score</span>
                            <span>{Math.round(framework.score)}%</span>
                          </div>
                          <Progress value={framework.score} className="h-2" />
                        </div>
                      )}
                      <div className="flex justify-between text-sm text-gray-600">
                        <span>Gaps to address:</span>
                        <span>{framework.gapCount}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Google Drive Picker - Now inline in the UI where needed */}
    </div>
  );
}