import type { Agent, Conversation, Message } from "@arinova/shared/types";

// ===== Agents =====
export const mockAgents: Agent[] = [
  {
    id: "agent-1",
    name: "CodeBot",
    description: "Full-stack coding assistant. Writes clean, tested code.",
    avatarUrl: null,
    a2aEndpoint: "https://codebot.example.com/.well-known/agent.json",
    pairingCode: "A3X9K2",
    pairingCodeExpiresAt: null,
    ownerId: "user-1",
    isPublic: false,
    category: null,
    usageCount: 0,
    createdAt: new Date("2025-01-15"),
    updatedAt: new Date("2025-01-15"),
  },
  {
    id: "agent-2",
    name: "DataAnalyst",
    description: "Data analysis and visualization specialist.",
    avatarUrl: null,
    a2aEndpoint: "https://data-analyst.example.com/.well-known/agent.json",
    pairingCode: "B7M4P5",
    pairingCodeExpiresAt: null,
    ownerId: "user-1",
    isPublic: false,
    category: null,
    usageCount: 0,
    createdAt: new Date("2025-02-01"),
    updatedAt: new Date("2025-02-01"),
  },
  {
    id: "agent-3",
    name: "CreativeWriter",
    description: "Creative writing and content generation assistant.",
    avatarUrl: null,
    a2aEndpoint: "https://creative-writer.example.com/.well-known/agent.json",
    pairingCode: "C2N8R6",
    pairingCodeExpiresAt: null,
    ownerId: "user-1",
    isPublic: false,
    category: null,
    usageCount: 0,
    createdAt: new Date("2025-02-10"),
    updatedAt: new Date("2025-02-10"),
  },
];

// ===== Conversations =====
export const mockConversations: Conversation[] = [
  {
    id: "conv-1",
    title: "React Hook Patterns",
    userId: "user-1",
    agentId: "agent-1",
    type: "direct",
    pinnedAt: null,
    createdAt: new Date("2025-03-01T10:00:00"),
    updatedAt: new Date("2025-03-01T10:30:00"),
  },
  {
    id: "conv-2",
    title: "Sales Data Analysis",
    userId: "user-1",
    agentId: "agent-2",
    type: "direct",
    pinnedAt: null,
    createdAt: new Date("2025-03-02T14:00:00"),
    updatedAt: new Date("2025-03-02T15:00:00"),
  },
  {
    id: "conv-3",
    title: "Blog Post Draft",
    userId: "user-1",
    agentId: "agent-3",
    type: "direct",
    pinnedAt: null,
    createdAt: new Date("2025-03-03T09:00:00"),
    updatedAt: new Date("2025-03-03T09:45:00"),
  },
  {
    id: "conv-4",
    title: "API Error Debugging",
    userId: "user-1",
    agentId: "agent-1",
    type: "direct",
    pinnedAt: null,
    createdAt: new Date("2025-03-04T16:00:00"),
    updatedAt: new Date("2025-03-04T16:20:00"),
  },
];

// ===== Messages =====
export const mockMessages: Record<string, Message[]> = {
  "conv-1": [
    {
      id: "msg-1-1",
      conversationId: "conv-1",
      role: "user",
      content: "How do I create a custom React hook for debouncing?",
      status: "completed",
      createdAt: new Date("2025-03-01T10:00:00"),
      updatedAt: new Date("2025-03-01T10:00:00"),
    },
    {
      id: "msg-1-2",
      conversationId: "conv-1",
      role: "agent",
      content: `Here's a clean **useDebounce** hook implementation:

\`\`\`typescript
import { useState, useEffect } from "react";

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
\`\`\`

**Usage example:**

\`\`\`tsx
function SearchInput() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    if (debouncedQuery) {
      fetchResults(debouncedQuery);
    }
  }, [debouncedQuery]);

  return <input value={query} onChange={e => setQuery(e.target.value)} />;
}
\`\`\`

Key points:
- The hook returns a **debounced version** of the value
- Cleanup function prevents stale updates
- Works with any value type via generics`,
      status: "completed",
      createdAt: new Date("2025-03-01T10:01:00"),
      updatedAt: new Date("2025-03-01T10:01:30"),
    },
    {
      id: "msg-1-3",
      conversationId: "conv-1",
      role: "user",
      content: "Can you also show a useDebouncedCallback version?",
      status: "completed",
      createdAt: new Date("2025-03-01T10:05:00"),
      updatedAt: new Date("2025-03-01T10:05:00"),
    },
    {
      id: "msg-1-4",
      conversationId: "conv-1",
      role: "agent",
      content: `Sure! Here's **useDebouncedCallback** — useful when you want to debounce a function call instead of a value:

\`\`\`typescript
import { useCallback, useRef } from "react";

export function useDebouncedCallback<T extends (...args: any[]) => void>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  return useCallback(
    ((...args: Parameters<T>) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => callback(...args), delay);
    }) as T,
    [callback, delay]
  );
}
\`\`\`

This is better for **event handlers** where you want to debounce the action, not a state value.`,
      status: "completed",
      createdAt: new Date("2025-03-01T10:06:00"),
      updatedAt: new Date("2025-03-01T10:06:30"),
    },
  ],
  "conv-2": [
    {
      id: "msg-2-1",
      conversationId: "conv-2",
      role: "user",
      content: "I have a CSV with monthly sales data. How should I start analyzing it?",
      status: "completed",
      createdAt: new Date("2025-03-02T14:00:00"),
      updatedAt: new Date("2025-03-02T14:00:00"),
    },
    {
      id: "msg-2-2",
      conversationId: "conv-2",
      role: "agent",
      content: `Great question! Here's a structured approach for sales data analysis:

1. **Data Loading & Inspection**
   - Check for missing values and data types
   - Verify date formats and numeric columns

2. **Descriptive Statistics**
   - Total revenue, average order value
   - Monthly growth rates

3. **Trend Analysis**
   - Plot monthly revenue over time
   - Identify seasonal patterns

4. **Key Metrics**
   - Month-over-month growth: \`((current - previous) / previous) * 100\`
   - Moving averages for smoothing

Would you like me to write the analysis code in Python or help with a specific part?`,
      status: "completed",
      createdAt: new Date("2025-03-02T14:01:00"),
      updatedAt: new Date("2025-03-02T14:01:30"),
    },
    {
      id: "msg-2-3",
      conversationId: "conv-2",
      role: "user",
      content: "Show me Python code for the trend analysis part.",
      status: "completed",
      createdAt: new Date("2025-03-02T14:10:00"),
      updatedAt: new Date("2025-03-02T14:10:00"),
    },
    {
      id: "msg-2-4",
      conversationId: "conv-2",
      role: "agent",
      content: `Here's the trend analysis code:

\`\`\`python
import pandas as pd
import matplotlib.pyplot as plt

# Load data
df = pd.read_csv("sales.csv", parse_dates=["date"])
df = df.sort_values("date")

# Monthly aggregation
monthly = df.groupby(df["date"].dt.to_period("M"))["revenue"].sum()

# Calculate moving average
monthly_ma = monthly.rolling(window=3).mean()

# Plot
fig, ax = plt.subplots(figsize=(12, 6))
monthly.plot(ax=ax, label="Monthly Revenue", marker="o")
monthly_ma.plot(ax=ax, label="3-Month MA", linestyle="--")
ax.set_title("Revenue Trend Analysis")
ax.legend()
plt.tight_layout()
plt.show()
\`\`\`

The **3-month moving average** smooths out noise and reveals the underlying trend.`,
      status: "completed",
      createdAt: new Date("2025-03-02T14:11:00"),
      updatedAt: new Date("2025-03-02T14:11:30"),
    },
  ],
  "conv-3": [
    {
      id: "msg-3-1",
      conversationId: "conv-3",
      role: "user",
      content: "Help me write an intro paragraph for a blog about AI agents in everyday life.",
      status: "completed",
      createdAt: new Date("2025-03-03T09:00:00"),
      updatedAt: new Date("2025-03-03T09:00:00"),
    },
    {
      id: "msg-3-2",
      conversationId: "conv-3",
      role: "agent",
      content: `Here's a draft intro:

> Imagine waking up to find your morning briefing already prepared, your calendar optimized, and your inbox triaged — all by digital assistants that learned your preferences while you slept. This isn't science fiction. AI agents are quietly weaving themselves into the fabric of everyday life, transforming how we work, communicate, and make decisions.

Want me to adjust the **tone** (more formal/casual) or **focus** (technical audience vs. general public)?`,
      status: "completed",
      createdAt: new Date("2025-03-03T09:01:00"),
      updatedAt: new Date("2025-03-03T09:01:30"),
    },
    {
      id: "msg-3-3",
      conversationId: "conv-3",
      role: "user",
      content: "Make it more casual and add a hook at the beginning.",
      status: "completed",
      createdAt: new Date("2025-03-03T09:05:00"),
      updatedAt: new Date("2025-03-03T09:05:00"),
    },
    {
      id: "msg-3-4",
      conversationId: "conv-3",
      role: "agent",
      content: `Here's the revised version with a stronger hook:

> **You already have an AI agent. You just don't know it yet.**
>
> That spam filter saving you from Nigerian princes? Agent. The playlist that somehow knows you need sad songs on rainy Tuesdays? Also an agent. AI agents have been sneaking into our lives for years, but now they're stepping out of the shadows and getting *way* more capable. We're talking agents that book your flights, debug your code, and even negotiate your cable bill. Buckle up — the age of AI assistants is just getting started.

Changes made:
- **Bold hook** that creates curiosity
- Conversational tone with humor
- Concrete, relatable examples
- Ends with forward momentum`,
      status: "completed",
      createdAt: new Date("2025-03-03T09:06:00"),
      updatedAt: new Date("2025-03-03T09:06:30"),
    },
  ],
  "conv-4": [
    {
      id: "msg-4-1",
      conversationId: "conv-4",
      role: "user",
      content: "I'm getting a 403 error when calling my API endpoint. Here's the error:\n\n```\nFetch failed: 403 Forbidden\nHeaders: { 'content-type': 'application/json' }\n```",
      status: "completed",
      createdAt: new Date("2025-03-04T16:00:00"),
      updatedAt: new Date("2025-03-04T16:00:00"),
    },
    {
      id: "msg-4-2",
      conversationId: "conv-4",
      role: "agent",
      content: `A **403 Forbidden** typically means authentication/authorization issues. Let's debug step by step:

1. **Check if auth token is being sent:**
\`\`\`typescript
// Make sure Authorization header is included
const res = await fetch("/api/data", {
  headers: {
    "Content-Type": "application/json",
    "Authorization": \`Bearer \${token}\`,
  },
});
\`\`\`

2. **Common causes:**
   - Token expired or malformed
   - Missing CORS headers on the server
   - API route requires specific role/permission
   - CSRF token missing for non-GET requests

3. **Quick diagnostic:**
\`\`\`bash
curl -v -H "Authorization: Bearer YOUR_TOKEN" https://api.example.com/data
\`\`\`

Can you share your **fetch call code** and **server-side auth middleware**?`,
      status: "completed",
      createdAt: new Date("2025-03-04T16:01:00"),
      updatedAt: new Date("2025-03-04T16:01:30"),
    },
    {
      id: "msg-4-3",
      conversationId: "conv-4",
      role: "user",
      content: "Ah, I forgot to include the Authorization header. Let me fix that. Thanks!",
      status: "completed",
      createdAt: new Date("2025-03-04T16:05:00"),
      updatedAt: new Date("2025-03-04T16:05:00"),
    },
  ],
};

// ===== Streaming simulation text =====
export const mockStreamingResponses: Record<string, string> = {
  "agent-1": `Got it! Let me help you with that.

Here's what I'd suggest:

\`\`\`typescript
// Clean, type-safe implementation
export function solution() {
  console.log("Hello from CodeBot!");
}
\`\`\`

Let me know if you need anything else!`,
  "agent-2": `Great question! Based on the data patterns I can see:

1. **Primary trend**: Upward trajectory with seasonal dips in Q3
2. **Key insight**: The correlation coefficient is **0.87**, suggesting a strong positive relationship
3. **Recommendation**: Focus on Q4 campaigns for maximum ROI

Want me to dive deeper into any of these points?`,
  "agent-3": `Here's what I came up with:

> *The morning light filtered through half-drawn curtains, painting amber streaks across the cluttered desk. She reached for her coffee — cold, as usual — and smiled at the familiar chaos of another day beginning.*

I tried to capture that cozy, slice-of-life feeling. Want me to adjust the mood or continue the scene?`,
};
