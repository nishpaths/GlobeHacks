export interface InsforgeChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface InsforgeChatResponse {
  response: string;
  model?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export class InsforgeHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string
  ) {
    super(`InsForge request failed with status ${status}`);
  }
}

export function buildInFilter(values: string[]): string {
  return `in.(${values.join(",")})`;
}

export class InsforgeApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly authToken: string
  ) {}

  private async request<T>(
    path: string,
    init: RequestInit = {},
    contentType = "application/json"
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${this.authToken}`);

    if (contentType) {
      headers.set("content-type", contentType);
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      cache: "no-store"
    });

    const rawBody = await response.text();
    if (!response.ok) {
      throw new InsforgeHttpError(response.status, rawBody);
    }

    if (!rawBody) {
      return [] as T;
    }

    return JSON.parse(rawBody) as T;
  }

  async queryRecords<T>(
    table: string,
    params: Record<string, string | number | undefined>
  ): Promise<T[]> {
    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        searchParams.set(key, String(value));
      }
    }

    return this.request<T[]>(
      `/api/database/records/${table}?${searchParams.toString()}`,
      { method: "GET" },
      ""
    );
  }

  async createRecords<T extends Record<string, unknown>>(
    table: string,
    rows: T[]
  ): Promise<T[]> {
    return this.request<T[]>(
      `/api/database/records/${table}`,
      {
        method: "POST",
        headers: {
          Prefer: "return=representation"
        },
        body: JSON.stringify(rows)
      }
    );
  }

  async chatCompletion(args: {
    model: string;
    messages: InsforgeChatMessage[];
    temperature?: number;
    maxTokens?: number;
  }): Promise<InsforgeChatResponse> {
    return this.request<InsforgeChatResponse>("/api/ai/chat/completion", {
      method: "POST",
      body: JSON.stringify(args)
    });
  }
}
