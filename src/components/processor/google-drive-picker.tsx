'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Search,
  FileText,
  Folder,
  Image,
  File,
  ArrowLeft,
  ExternalLink,
  Plus,
  AlertTriangle
} from 'lucide-react';
import { DriveFile } from '@/lib/db/types';
import { useDocumentsStore } from '@/stores/documents-store';

declare global {
  interface Window {
    google: any;
    gapi: any;
  }
}

interface GoogleDrivePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFile: (fileId: string) => Promise<void>;
  selectedFiles?: string[];
}

export function GoogleDrivePicker({
  isOpen,
  onClose,
  onSelectFile,
  selectedFiles = []
}: GoogleDrivePickerProps) {
  const {
    driveFiles,
    isLoading,
    error,
    fetchDriveFiles,
    clearError
  } = useDocumentsStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>();
  const [folderPath, setFolderPath] = useState<Array<{ id: string; name: string }>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load Google Drive files when dialog opens
  useEffect(() => {
    if (isOpen) {
      fetchDriveFiles(currentFolderId);
      clearError();
    }
  }, [isOpen, currentFolderId, fetchDriveFiles, clearError]);

  // Handle search
  const handleSearch = async () => {
    if (searchQuery.trim()) {
      await fetchDriveFiles(undefined, searchQuery.trim());
    } else {
      await fetchDriveFiles(currentFolderId);
    }
  };

  // Handle folder navigation
  const handleEnterFolder = async (folder: DriveFile) => {
    const newFolderPath = [...folderPath, { id: folder.id, name: folder.name }];
    setFolderPath(newFolderPath);
    setCurrentFolderId(folder.id);
    setSearchQuery(''); // Clear search when navigating
  };

  // Handle back navigation
  const handleGoBack = async () => {
    if (folderPath.length > 0) {
      const newPath = folderPath.slice(0, -1);
      setFolderPath(newPath);
      setCurrentFolderId(newPath.length > 0 ? newPath[newPath.length - 1].id : undefined);
    }
  };

  // Handle file selection
  const handleSelectFile = async (file: DriveFile) => {
    if (selectedFiles.includes(file.id)) {
      return; // Already selected
    }

    try {
      setIsSubmitting(true);
      await onSelectFile(file.id);
      onClose();
    } catch (error) {
      console.error('Error selecting file:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get file icon based on MIME type
  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes('folder')) {
      return <Folder size={20} className="text-blue-500" />;
    }
    if (mimeType.includes('document')) {
      return <FileText size={20} className="text-blue-600" />;
    }
    if (mimeType.includes('spreadsheet')) {
      return <FileText size={20} className="text-green-600" />;
    }
    if (mimeType.includes('presentation')) {
      return <FileText size={20} className="text-orange-600" />;
    }
    if (mimeType.includes('image')) {
      return <Image size={20} className="text-purple-600" />;
    }
    if (mimeType.includes('pdf')) {
      return <File size={20} className="text-red-600" />;
    }
    return <File size={20} className="text-gray-600" />;
  };

  // Get file type display name
  const getFileType = (mimeType: string) => {
    if (mimeType.includes('folder')) return 'Folder';
    if (mimeType.includes('document')) return 'Google Doc';
    if (mimeType.includes('spreadsheet')) return 'Google Sheet';
    if (mimeType.includes('presentation')) return 'Google Slides';
    if (mimeType.includes('pdf')) return 'PDF';
    if (mimeType.includes('image')) return 'Image';
    return 'File';
  };

  // Format file size
  const formatFileSize = (size?: string) => {
    if (!size) return '';
    const bytes = parseInt(size);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const filteredFiles = driveFiles.filter(file =>
    searchQuery
      ? file.name.toLowerCase().includes(searchQuery.toLowerCase())
      : true
  );

  const folders = filteredFiles.filter(file => file.mimeType?.includes('folder'));
  const files = filteredFiles.filter(file => !file.mimeType?.includes('folder'));

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Select Google Drive Files</DialogTitle>
          <DialogDescription>
            Choose files from your Google Drive to link to this project
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col space-y-4">
          {/* Navigation and Search */}
          <div className="space-y-3">
            {/* Breadcrumb */}
            {folderPath.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleGoBack}
                  className="h-7 px-2"
                >
                  <ArrowLeft size={14} />
                </Button>
                <span>My Drive</span>
                {folderPath.map((folder, index) => (
                  <span key={folder.id}>
                    <span className="mx-1">/</span>
                    <span>{folder.name}</span>
                  </span>
                ))}
              </div>
            )}

            {/* Search */}
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Search files and folders"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-9"
                />
              </div>
              <Button onClick={handleSearch} disabled={isLoading}>
                Search
              </Button>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle size={16} />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* File List */}
          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 border rounded-lg">
                    <Skeleton className="h-5 w-5" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {/* Folders */}
                {folders.map((folder) => (
                  <Card
                    key={folder.id}
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => handleEnterFolder(folder)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        {getFileIcon(folder.mimeType)}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{folder.name}</div>
                          <div className="text-sm text-gray-500">
                            Modified {new Date(folder.modifiedTime).toLocaleDateString()}
                          </div>
                        </div>
                        <Badge variant="outline">Folder</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {/* Files */}
                {files.map((file) => {
                  const isSelected = selectedFiles.includes(file.id);
                  const isAlreadyLinked = isSelected;

                  return (
                    <Card
                      key={file.id}
                      className={`cursor-pointer transition-colors ${
                        isAlreadyLinked
                          ? 'bg-gray-100 border-gray-300'
                          : 'hover:bg-gray-50'
                      }`}
                      onClick={() => !isAlreadyLinked && handleSelectFile(file)}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center gap-3">
                          {getFileIcon(file.mimeType)}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{file.name}</div>
                            <div className="text-sm text-gray-500 flex items-center gap-2">
                              <span>Modified {new Date(file.modifiedTime).toLocaleDateString()}</span>
                              {file.size && <span>• {formatFileSize(file.size)}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">
                              {getFileType(file.mimeType)}
                            </Badge>
                            {isAlreadyLinked ? (
                              <Badge variant="secondary">Already linked</Badge>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(file.webViewLink, '_blank');
                                }}
                              >
                                <ExternalLink size={14} />
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}

                {filteredFiles.length === 0 && !isLoading && (
                  <div className="text-center py-12 text-gray-500">
                    <FileText size={48} className="mx-auto mb-4 text-gray-300" />
                    <p>No files found</p>
                    {searchQuery && (
                      <p className="text-sm">Try adjusting your search terms</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          {/* Footer */}
          <div className="flex justify-between items-center pt-4 border-t">
            <div className="text-sm text-gray-600">
              {filteredFiles.length > 0 && (
                <span>
                  {filteredFiles.length} items • {selectedFiles.length} already linked
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}