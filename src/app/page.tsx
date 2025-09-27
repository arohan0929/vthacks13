"use client";

import { useAuthStore } from "@/stores/auth-store/auth-store";
import { useProjectsStore } from "@/stores/projects-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ProjectForm } from "@/components/processor/project-form";
import { toast } from "sonner";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, FileText, Target, BarChart3, Clock, User, LogOut } from "lucide-react";

export default function Home() {
  const { user, loading, signOut } = useAuthStore();
  const { projects, isLoading, fetchProjects, createProject } = useProjectsStore();
  const [showProjectForm, setShowProjectForm] = useState(false);

  useEffect(() => {
    if (user) {
      fetchProjects();
    }
  }, [user, fetchProjects]);

  const handleLogout = async () => {
    try {
      await signOut();
      toast.success("Logged out successfully!");
    } catch (error) {
      console.error("Logout error:", error);
      toast.error("Failed to log out. Please try again.");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100';
      case 'analyzing':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100';
      case 'draft':
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <BarChart3 className="h-4 w-4" />;
      case 'analyzing':
        return <Clock className="h-4 w-4" />;
      case 'draft':
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const handleCreateProject = async (data: { name: string; description: string }) => {
    try {
      await createProject({
        user_id: '', // This will be ignored by the API - user_id comes from token
        name: data.name,
        description: data.description,
      });
      toast.success("Project created successfully!");
    } catch (error) {
      console.error("Failed to create project:", error);
      toast.error("Failed to create project. Please try again.");
      throw error; // Re-throw to let the form handle the error state
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-full" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">Compliance Copilot</CardTitle>
            <CardDescription>
              Upload everything, get instant compliance clarity
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2">
              <Button asChild className="w-full">
                <Link href="/login">Sign In</Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link href="/signup">Create Account</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-white dark:bg-gray-900">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Compliance Copilot</h1>
              <p className="text-sm text-muted-foreground">Universal Input Processor</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4" />
                <span className="text-sm">{user.displayName}</span>
              </div>
              <Button onClick={handleLogout} variant="outline" size="sm">
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold">Your Projects</h2>
            <p className="text-muted-foreground mt-1">
              Manage your compliance projects and analyze documents
            </p>
          </div>
          <Button onClick={() => setShowProjectForm(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New Project
          </Button>
        </div>

        {/* Projects Loading State */}
        {isLoading && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" data-testid="projects-loading">
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && projects.length === 0 && (
          <div className="text-center py-12">
            <Target className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-2xl font-semibold mb-2">No projects yet</h3>
            <p className="text-muted-foreground mb-6">
              Create your first project to get started with compliance analysis
            </p>
            <Button onClick={() => setShowProjectForm(true)} size="lg" className="gap-2">
              <Plus className="h-5 w-5" />
              Create Your First Project
            </Button>
          </div>
        )}

        {/* Projects Grid */}
        {!isLoading && projects.length > 0 && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Card key={project.id} className="hover:shadow-md transition-shadow cursor-pointer">
                <Link href={`/projects/${project.id}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg line-clamp-2">{project.name}</CardTitle>
                      <Badge className={`ml-2 ${getStatusColor(project.status)} flex items-center gap-1`}>
                        {getStatusIcon(project.status)}
                        {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
                      </Badge>
                    </div>
                    {project.description && (
                      <CardDescription className="line-clamp-2">
                        {project.description}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <div className="flex items-center gap-4">
                        <span>{project.document_count || 0} documents</span>
                        {project.framework_count > 0 && (
                          <span>{project.framework_count} frameworks</span>
                        )}
                      </div>
                      {project.latest_compliance_score && (
                        <span className="font-medium text-foreground">
                          {project.latest_compliance_score}% score
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">
                      Updated {new Date(project.updated_at).toLocaleDateString()}
                    </div>
                  </CardContent>
                </Link>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Project Form Dialog */}
      <ProjectForm
        isOpen={showProjectForm}
        onClose={() => setShowProjectForm(false)}
        onSubmit={handleCreateProject}
      />
    </div>
  );
}
