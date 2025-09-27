'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, FileText } from 'lucide-react';
import { getDriveAccessToken } from '@/lib/firebase/firebase';

declare global {
  interface Window {
    google: {
      picker: {
        Action: { PICKED: string };
        Feature: { NAV_HIDDEN: string; MULTISELECT_ENABLED: string };
        ViewId: {
          DOCS: string;
          SPREADSHEETS: string;
          PRESENTATIONS: string;
          PDFS: string;
          FOLDERS: string;
        };
        PickerBuilder: new () => {
          enableFeature: (feature: string) => GooglePickerBuilder;
          setAppId: (appId: string) => GooglePickerBuilder;
          setOAuthToken: (token: string) => GooglePickerBuilder;
          addView: (viewId: string) => GooglePickerBuilder;
          setCallback: (callback: (data: GooglePickerResult) => void) => GooglePickerBuilder;
          setOrigin: (origin: string) => GooglePickerBuilder;
          setSize: (width: number, height: number) => GooglePickerBuilder;
          build: () => GooglePicker;
        };
      };
    };
    gapi: {
      load: (apis: string, callback: () => void) => void;
    };
  }
}

interface GooglePickerBuilder {
  enableFeature: (feature: string) => GooglePickerBuilder;
  setAppId: (appId: string) => GooglePickerBuilder;
  setOAuthToken: (token: string) => GooglePickerBuilder;
  addView: (viewId: string) => GooglePickerBuilder;
  setCallback: (callback: (data: GooglePickerResult) => void) => GooglePickerBuilder;
  setOrigin: (origin: string) => GooglePickerBuilder;
  setSize: (width: number, height: number) => GooglePickerBuilder;
  build: () => GooglePicker;
}

interface GooglePicker {
  setVisible: (visible: boolean) => void;
}

interface GooglePickerResult {
  action: string;
  docs?: Array<{ id: string; name: string }>;
}

// Note: Google Picker can work with just OAuth tokens, no API key needed

interface GoogleDrivePickerProps {
  onSelectFile: (fileId: string) => Promise<void>;
  selectedFiles?: string[];
  disabled?: boolean;
}

export function GoogleDrivePicker({
  onSelectFile,
  selectedFiles = [],
  disabled = false
}: GoogleDrivePickerProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGapiLoaded, setIsGapiLoaded] = useState(false);

  // Load Google APIs on component mount
  useEffect(() => {
    const loadGoogleAPIs = () => {
      // Load GAPI
      if (!window.gapi) {
        const gapiScript = document.createElement('script');
        gapiScript.src = 'https://apis.google.com/js/api.js';
        gapiScript.onload = () => {
          window.gapi.load('auth2:picker', () => {
            setIsGapiLoaded(true);
          });
        };
        document.head.appendChild(gapiScript);
      } else {
        window.gapi.load('auth2:picker', () => {
          setIsGapiLoaded(true);
        });
      }
    };

    loadGoogleAPIs();
  }, []);

  // Handle picker callback
  const pickerCallback = async (data: GooglePickerResult) => {
    if (data.action === window.google.picker.Action.PICKED && data.docs && data.docs.length > 0) {
      const fileData = data.docs[0];
      const fileId = fileData.id;

      if (selectedFiles.includes(fileId)) {
        setError('This file is already linked to the project');
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        await onSelectFile(fileId);
      } catch (error) {
        console.error('Error selecting file:', error);
        setError('Failed to link the selected file. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Create and show the picker
  const showPicker = async () => {
    if (!isGapiLoaded) {
      setError('Google APIs are still loading. Please try again in a moment.');
      return;
    }

    try {
      setError(null);
      setIsLoading(true);

      // Get the OAuth access token
      const accessToken = await getDriveAccessToken();
      if (!accessToken) {
        throw new Error('No Google Drive access token available. Please sign out and sign in again.');
      }

      // Create picker
      const picker = new window.google.picker.PickerBuilder()
        .enableFeature(window.google.picker.Feature.NAV_HIDDEN)
        .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
        .setOAuthToken(accessToken)
        .addView(window.google.picker.ViewId.DOCS)
        .addView(window.google.picker.ViewId.SPREADSHEETS)
        .addView(window.google.picker.ViewId.PRESENTATIONS)
        .addView(window.google.picker.ViewId.PDFS)
        .addView(window.google.picker.ViewId.FOLDERS)
        .setCallback(pickerCallback)
        .setOrigin(window.location.protocol + '//' + window.location.host)
        .setSize(1051, 650)
        .build();

      picker.setVisible(true);
    } catch (error) {
      console.error('Error opening picker:', error);
      setError(error instanceof Error ? error.message : 'Failed to open Google Drive picker');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        onClick={showPicker}
        disabled={disabled || isLoading || !isGapiLoaded}
        className="w-full"
      >
        <FileText className="mr-2 h-4 w-4" />
        {isLoading
          ? 'Opening Google Drive...'
          : !isGapiLoaded
          ? 'Loading Google APIs...'
          : 'Select from Google Drive'
        }
      </Button>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle size={16} />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {selectedFiles.length > 0 && (
        <div className="text-sm text-gray-600">
          {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} already linked
        </div>
      )}
    </div>
  );
}