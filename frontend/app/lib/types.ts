export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  videoUrl?: string;
  videoStatus?: string;
}

export interface Chat {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  selectedModel?: string;
}
