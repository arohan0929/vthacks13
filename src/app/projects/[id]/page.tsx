"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store/auth-store";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FileText,
  Shield,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  Lightbulb,
  Folder,
} from "lucide-react";
import { GoogleDrivePicker } from "@/components/processor/google-drive-picker";
import { Navbar } from "@/components/navigation/navbar";
import { SourcesUpload } from "@/components/dashboard/sources-upload";
import { IdeateSection } from "@/components/dashboard/ideate/ideate-section";
import { CompliancePlaceholder } from "@/components/dashboard/compliance-placeholder";
import { ProcessingStatus } from "@/components/processor/processing-status";
import { Project, Document } from "@/lib/db/types";
import { User } from "firebase/auth";

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

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { user, loading, isInitialized } = useAuthStore();
  const [projectData, setProjectData] = useState<ProjectData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("sources");
  const [hasUploadedSources, setHasUploadedSources] = useState(false);

  useEffect(() => {
    // Only redirect if auth is fully initialized and confirmed no user
    if (isInitialized && !loading && !user) {
      router.push("/login");
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
        throw new Error("No authentication token");
      }

      const response = await fetch(`/api/projects/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Project not found");
        }
        throw new Error(`Failed to fetch project: ${response.statusText}`);
      }

      const data = await response.json();
      setProjectData(data);
      setHasUploadedSources(data.documents && data.documents.length > 0);
    } catch (error) {
      console.error("Error fetching project:", error);
      setError(
        error instanceof Error ? error.message : "Failed to load project"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSelectDriveFile = async (fileId: string) => {
    try {
      const token = await user?.getIdToken();
      if (!token) throw new Error("No authentication token");

      // Get Google OAuth token for Drive access
      const { getDriveAccessToken } = await import("@/lib/firebase/firebase");
      const googleToken = await getDriveAccessToken();
      if (!googleToken)
        throw new Error("No Google Drive access token available");

      const response = await fetch(`/api/projects/${id}/documents`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Google-Token": googleToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ driveFileId: fileId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to link document");
      }

      const responseData = await response.json();

      // Refresh project data to show new document
      await fetchProjectData();

      // Update sources uploaded state
      setHasUploadedSources(true);

      // Show success message with processing status
      if (responseData.processing_triggered) {
        console.log("Document processing started in background");
        // You could add a toast notification here
      }
    } catch (error) {
      console.error("Error linking document:", error);
      setError(
        error instanceof Error ? error.message : "Failed to link document"
      );
    }
  };

  const handleSyncDocuments = async () => {
    try {
      setIsSyncing(true);
      setError(null);

      const token = await user?.getIdToken();
      if (!token) throw new Error("No authentication token");

      const response = await fetch(`/api/projects/${id}/sync`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to sync documents");
      }

      const syncResult = await response.json();

      // Refresh project data to show updated information
      await fetchProjectData();

      // Show success message if changes were found
      if (syncResult.changedDocuments > 0) {
        // In a real app, you'd show a toast notification here
        console.log(
          `Sync completed: ${syncResult.changedDocuments} documents updated`
        );
      }
    } catch (error) {
      console.error("Error syncing documents:", error);
      setError(
        error instanceof Error ? error.message : "Failed to sync documents"
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAnalyzeProject = async () => {
    try {
      setIsAnalyzing(true);
      setError(null);

      const token = await user?.getIdToken();
      if (!token) throw new Error("No authentication token");

      const response = await fetch(`/api/projects/${id}/analyze`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to analyze project");
      }

      const analysisResult = await response.json();

      // Refresh project data to show analysis results
      await fetchProjectData();

      // In a real app, you'd show detailed analysis results in a modal or new page
      console.log("Analysis completed:", analysisResult);
    } catch (error) {
      console.error("Error analyzing project:", error);
      setError(
        error instanceof Error ? error.message : "Failed to analyze project"
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "completed":
        return "default";
      case "analyzing":
        return "secondary";
      case "draft":
      default:
        return "outline";
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
            <Button onClick={() => router.push("/projects")}>
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

  // Wrapper component to handle async token retrieval
  const ProcessingStatusWrapper = ({
    projectId,
    user,
  }: {
    projectId: string;
    user: User;
  }) => {
    const [authToken, setAuthToken] = useState<string | null>(null);

    useEffect(() => {
      const getToken = async () => {
        try {
          const token = await user.getIdToken();
          setAuthToken(token);
        } catch (error) {
          console.error("Failed to get auth token:", error);
        }
      };
      getToken();
    }, [user]);

    if (!authToken) {
      return (
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-gray-500">
              <p className="text-sm">Loading processing status...</p>
            </div>
          </CardContent>
        </Card>
      );
    }

    return <ProcessingStatus projectId={projectId} authToken={authToken} />;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <Navbar projectName={project.name} />

      <div className="container mx-auto px-4 py-8">
        {/* Project Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-gray-900">{project.name}</h1>
            <Badge variant={getStatusBadgeVariant(project.status)}>
              {project.status}
            </Badge>
          </div>
          <p className="text-gray-600">
            {project.description || "No description provided"}
          </p>
        </div>

        {/* Dashboard Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="dashboard-tabs grid w-full grid-cols-3 max-w-2xl mx-auto mb-8 h-12 p-1">
            <TabsTrigger
              value="sources"
              className="flex items-center gap-2 h-10 px-6 transition-all duration-200"
            >
              <Folder size={18} />
              <span>Sources</span>
            </TabsTrigger>
            <TabsTrigger
              value="ideate"
              disabled={!hasUploadedSources}
              className="flex items-center gap-2 h-10 px-6 transition-all duration-200"
            >
              <Lightbulb size={18} />
              <span>Ideate</span>
            </TabsTrigger>
            <TabsTrigger
              value="compliance-report"
              disabled={!hasUploadedSources}
              className="flex items-center gap-2 h-10 px-6 transition-all duration-200"
            >
              <Shield size={18} />
              <span>Compliance Report</span>
            </TabsTrigger>
          </TabsList>

          {/* Sources Tab */}
          <TabsContent value="sources" className="mt-6">
            <SourcesUpload
              projectId={id}
              onFolderSelected={handleSelectDriveFile}
              hasUploadedSources={hasUploadedSources}
              selectedFiles={documents.map((doc) => doc.drive_file_id)}
              selectedFolders={Array.from(
                new Set(
                  documents.map((doc) => doc.parent_folder_id).filter(Boolean)
                )
              )}
              disabled={isAnalyzing}
            />
          </TabsContent>

          {/* Ideate Tab */}
          <TabsContent value="ideate" className="mt-6">
            <IdeateSection isLocked={!hasUploadedSources} />
          </TabsContent>

          {/* Compliance Report Tab */}
          <TabsContent value="compliance-report" className="mt-6">
            <CompliancePlaceholder isLocked={!hasUploadedSources} />
          </TabsContent>
        </Tabs>

        {/* Processing Status */}
        {user && (
          <div className="mt-12">
            <ProcessingStatusWrapper projectId={id} user={user} />
          </div>
        )}

        {/* Sources Menu Placeholder */}
        {hasUploadedSources && (
          <div className="mt-8">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Sources Menu</CardTitle>
                <CardDescription>
                  Connected Google Drive folders and documents
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-gray-500 text-center py-4">
                  <p className="text-sm">
                    Connected sources will be displayed here
                  </p>
                  {documents.length > 0 && (
                    <p className="text-xs mt-1">
                      {documents.length} document
                      {documents.length !== 1 ? "s" : ""} currently linked
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
