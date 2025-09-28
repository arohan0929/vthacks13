export interface Question {
  id: string;
  text: string;
  type: 'multiple-choice' | 'yes-no' | 'text';
  options?: string[];
  answer?: string;
  timestamp: Date;
}

export interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  isOnlineLookup?: boolean;
}

export interface ResearchResult {
  id: string;
  query: string;
  results: Array<{
    title: string;
    url: string;
    snippet: string;
    source: string;
  }>;
  timestamp: Date;
}

export interface IdeateState {
  qaThread: Question[];
  chatMessages: ChatMessage[];
  researchResults: ResearchResult[];
  activeTab: 'qa' | 'chat';
  isOnlineLookupEnabled: boolean;
}

export type QuestionType = Question['type'];
export type MessageRole = ChatMessage['role'];