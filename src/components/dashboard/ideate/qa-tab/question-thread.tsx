'use client';

import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { QuestionCard } from './question-card';
import { Question } from '../types';

interface QuestionThreadProps {
  questions: Question[];
  onAnswer: (questionId: string, answer: string) => void;
  hasSourcesUploaded: boolean;
}

export function QuestionThread({ questions, onAnswer, hasSourcesUploaded }: QuestionThreadProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new questions are added
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [questions.length]);

  if (questions.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-center">
        <div className="max-w-md">
          {!hasSourcesUploaded ? (
            <>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Upload a Source
              </h3>
              <p className="text-gray-600 text-sm">
                Upload compliance documents in the Sources tab to start your Q&A session. The AI will ask you questions to help generate insights.
              </p>
            </>
          ) : (
            <>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Ready to Start!
              </h3>
              <p className="text-gray-600 text-sm">
                Your Q&A session will appear here. The AI will ask you questions to help generate insights from your compliance documents.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[500px] w-full pr-4" ref={scrollAreaRef}>
      <div className="space-y-0">
        {questions.map((question, index) => (
          <QuestionCard
            key={question.id}
            question={question}
            onAnswer={onAnswer}
            isAnswered={!!question.answer}
            showTimestamp={index === 0 || index === questions.length - 1}
          />
        ))}
      </div>
    </ScrollArea>
  );
}