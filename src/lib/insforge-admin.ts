import { InsforgeHttpError } from "@/lib/insforge-api";

export interface InsforgeFunctionDefinition {
  name: string;
  slug: string;
  description: string;
  code: string;
  status: "draft" | "active";
}

export class InsforgeAdminClient {
  constructor(
    private readonly baseUrl: string,
    private readonly adminApiKey: string
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${this.adminApiKey}`);
    headers.set("content-type", "application/json");

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      cache: "no-store"
    });

    const rawBody = await response.text();
    if (!response.ok) {
      throw new InsforgeHttpError(response.status, rawBody);
    }

    return rawBody ? (JSON.parse(rawBody) as T) : ({} as T);
  }

  getMetadata() {
    return this.request<{
      name: string;
      environment: string;
      timestamp: string;
    }>("/api/metadata", { method: "GET" });
  }

  getFunction(slug: string) {
    return this.request<{
      id: string;
      slug: string;
      status: "draft" | "active" | "error";
    }>(`/api/functions/${slug}`, { method: "GET" });
  }

  createFunction(definition: InsforgeFunctionDefinition) {
    return this.request<{ success: boolean }>("/api/functions", {
      method: "POST",
      body: JSON.stringify(definition)
    });
  }

  updateFunction(
    slug: string,
    definition: Omit<InsforgeFunctionDefinition, "slug">
  ) {
    return this.request<{ success: boolean }>(`/api/functions/${slug}`, {
      method: "PUT",
      body: JSON.stringify(definition)
    });
  }
}
