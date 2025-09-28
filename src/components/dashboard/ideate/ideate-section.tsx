'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, HelpCircle } from 'lucide-react';
import { QuestionThread } from './qa-tab/question-thread';
import { ChatInterface } from './chat-tab/chat-interface';
import { Question, ChatMessage, ResearchResult, IdeateState } from './types';

interface IdeateSectionProps {
  isLocked: boolean;
}

export function IdeateSection({ isLocked }: IdeateSectionProps) {
  const [state, setState] = useState<IdeateState>({
    qaThread: [],
    chatMessages: [],
    researchResults: [],
    activeTab: 'qa',
    isOnlineLookupEnabled: false
  });

  const [isLoading, setIsLoading] = useState(false);

  // Mock data for demonstration - replace with real API calls
  const mockQuestions: Question[] = [
    {
      id: '1',
      text: 'What type of compliance framework are you most interested in analyzing?',
      type: 'multiple-choice',
      options: ['GDPR', 'HIPAA', 'SOX', 'ISO 27001', 'CCPA'],
      timestamp: new Date()
    }
  ];

  const handleQAAnswer = useCallback((questionId: string, answer: string) => {
    setState(prev => ({
      ...prev,
      qaThread: prev.qaThread.map(q =>
        q.id === questionId ? { ...q, answer } : q
      )
    }));

    // Simulate adding a new question after answering
    setTimeout(() => {
      const newQuestion: Question = {
        id: Date.now().toString(),
        text: 'How many employees does your organization have?',
        type: 'multiple-choice',
        options: ['1-50', '51-200', '201-1000', '1000+'],
        timestamp: new Date()
      };

      setState(prev => ({
        ...prev,
        qaThread: [...prev.qaThread, newQuestion]
      }));
    }, 1000);
  }, []);

  const handleSendMessage = useCallback((message: string, isOnlineLookup: boolean) => {
    if (!message.trim()) return;

    // Add user message
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      content: message,
      role: 'user',
      timestamp: new Date(),
      isOnlineLookup
    };

    setState(prev => ({
      ...prev,
      chatMessages: [...prev.chatMessages, userMessage]
    }));

    setIsLoading(true);

    // Simulate AI response
    setTimeout(() => {
      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: `I understand you're asking about "${message}". Based on your compliance documents, here are some insights I can provide...`,
        role: 'assistant',
        timestamp: new Date()
      };

      setState(prev => ({
        ...prev,
        chatMessages: [...prev.chatMessages, aiMessage]
      }));

      // Simulate research results if online lookup is enabled
      if (isOnlineLookup) {
        const researchResult: ResearchResult = {
          id: Date.now().toString(),
          query: message,
          results: [
            {
              title: 'Compliance Best Practices Guide',
              url: 'https://example.com/guide',
              snippet: 'Comprehensive guide to compliance frameworks and implementation strategies...',
              source: 'ComplianceHub'
            },
            {
              title: 'Latest Regulatory Updates',
              url: 'https://example.com/updates',
              snippet: 'Recent changes to regulatory requirements and their impact on organizations...',
              source: 'RegWatch'
            }
          ],
          timestamp: new Date()
        };

        setState(prev => ({
          ...prev,
          researchResults: [...prev.researchResults, researchResult]
        }));
      }

      setIsLoading(false);
    }, 2000);
  }, []);

  const handleTabChange = useCallback((tab: string) => {
    setState(prev => ({
      ...prev,
      activeTab: tab as 'qa' | 'chat'
    }));
  }, []);

  const handleToggleOnlineLookup = useCallback((enabled: boolean) => {
    setState(prev => ({
      ...prev,
      isOnlineLookupEnabled: enabled
    }));
  }, []);

  // Initialize with mock data if not locked and no questions exist
  const questions = state.qaThread.length === 0 && !isLocked ? mockQuestions : state.qaThread;

  return (
    <Card className="min-h-[600px]">
      <CardContent className="p-6">
        <Tabs value={state.activeTab} onValueChange={handleTabChange}>
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="qa" className="flex items-center gap-2">
              <HelpCircle size={16} />
              <span>Q/A</span>
            </TabsTrigger>
            <TabsTrigger value="chat" className="flex items-center gap-2">
              <MessageSquare size={16} />
              <span>Chat & Research</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="qa" className="mt-0">
            <QuestionThread
              questions={questions}
              onAnswer={handleQAAnswer}
              hasSourcesUploaded={!isLocked}
            />
          </TabsContent>

          <TabsContent value="chat" className="mt-0">
            <ChatInterface
              messages={state.chatMessages}
              researchResults={state.researchResults}
              onSendMessage={handleSendMessage}
              isLoading={isLoading}
              onlineLookupEnabled={state.isOnlineLookupEnabled}
              onToggleOnlineLookup={handleToggleOnlineLookup}
              hasSourcesUploaded={!isLocked}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}