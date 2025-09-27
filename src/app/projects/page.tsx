'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store/auth-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Folder, FileText, Calendar, TrendingUp } from 'lucide-react';
import { ProjectSummary } from '@/lib/db/types';

export default function ProjectsPage() {
  const router = useRouter();
  const { user, loading } = useAuthStore();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }

    if (user) {
      fetchProjects();
    }
  }, [user, loading, router]);

  const fetchProjects = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const token = await user?.getIdToken();
      if (!token) {
        throw new Error('No authentication token');
      }

      const response = await fetch('/api/projects', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.statusText}`);
      }

      const data = await response.json();
      setProjects(data.projects || []);
    } catch (error) {
      console.error('Error fetching projects:', error);
      setError(error instanceof Error ? error.message : 'Failed to load projects');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateProject = () => {
    router.push('/projects/new');
  };

  const handleProjectClick = (projectId: string) => {
    router.push(`/projects/${projectId}`);
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600';
      case 'analyzing':
        return 'text-blue-600';
      case 'draft':
      default:
        return 'text-gray-600';
    }
  };

  if (loading || isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="cursor-pointer">
              <CardHeader>
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-full" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </CardContent>
            </Card>
          ))}
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
          <Button onClick={fetchProjects}>Try Again</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Compliance Projects
          </h1>
          <p className="text-gray-600 mt-2">
            Manage your compliance assessment projects and track progress
          </p>
        </div>
        <Button onClick={handleCreateProject} className="flex items-center gap-2">
          <Plus size={20} />
          New Project
        </Button>
      </div>

      {/* Projects Grid */}
      {projects.length === 0 ? (
        <div className="text-center py-16">
          <Folder size={64} className="mx-auto text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            No projects yet
          </h2>
          <p className="text-gray-600 mb-6">
            Create your first compliance project to get started
          </p>
          <Button onClick={handleCreateProject} className="flex items-center gap-2">
            <Plus size={20} />
            Create Project
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <Card
              key={project.id}
              className="cursor-pointer hover:shadow-lg transition-shadow duration-200"
              onClick={() => handleProjectClick(project.id)}
            >
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="text-lg mb-2">{project.name}</CardTitle>
                    <CardDescription className="line-clamp-2">
                      {project.description || 'No description provided'}
                    </CardDescription>
                  </div>
                  <Badge variant={getStatusBadgeVariant(project.status)}>
                    {project.status}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent>
                <div className="space-y-3">
                  {/* Documents */}
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <FileText size={16} />
                    <span>{project.document_count} documents</span>
                  </div>

                  {/* Frameworks */}
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <TrendingUp size={16} />
                    <span>{project.framework_count} frameworks detected</span>
                  </div>

                  {/* Compliance Score */}
                  {project.latest_compliance_score > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: `${project.latest_compliance_score}%` }}
                        />
                      </div>
                      <span className="text-gray-600 min-w-0">
                        {Math.round(project.latest_compliance_score)}%
                      </span>
                    </div>
                  )}

                  {/* Last Updated */}
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Calendar size={16} />
                    <span>
                      Updated {new Date(project.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}