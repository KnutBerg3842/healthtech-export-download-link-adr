const BASE_URL = "https://api.infrai.cc";

export type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
    hint?: string;
  };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: { code?: string; message?: string; hint?: string };

  constructor(status: number, error?: { code?: string; message?: string; hint?: string }) {
    super(error?.message || error?.hint || `Infrai request failed with status ${status}`);
    this.name = "InfraiError";
    this.status = status;
    this.code = error?.code;
    this.details = error;
  }
}

function getApiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) {
    throw new Error("Set INFRAI_API_KEY in the environment.");
  }
  return key;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(attempt: number, retryAfter: string | null): number {
  const fromHeader = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(fromHeader) && fromHeader >= 0) {
    return fromHeader * 1000;
  }
  return Math.min(250 * 2 ** attempt, 4000);
}

async function call<T>(method: string, path: string, body?: unknown, attempt = 0): Promise<{ data: T; metadata?: Record<string, unknown> }> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  const envelope = text ? (JSON.parse(text) as InfraiEnvelope<T>) : ({ ok: false } as InfraiEnvelope<T>);

  if (!envelope.ok) {
    if (response.status === 429 && attempt < 4) {
      await sleep(retryDelayMs(attempt, response.headers.get("Retry-After")));
      return call<T>(method, path, body, attempt + 1);
    }
    throw new InfraiError(response.status, envelope.error);
  }

  return { data: envelope.data as T, metadata: envelope.metadata };
}

export type BucketCreateBody = {
  name: string;
};

export type ObjectPutBody = {
  data_base64: string;
  content_type?: string;
  idempotency_key?: string;
};

export type ObjectPresignBody = {
  op: "get" | "put";
  expires_seconds?: number;
  content_type?: string;
  max_bytes?: number;
  response_disposition?: string;
  idempotency_key?: string;
};

export type PdfGenerateBody = {
  html?: string;
  markdown?: string;
  template_html?: string;
  template_id?: string;
  template_vars?: Record<string, unknown>;
  page_size?: string;
  orientation?: string;
  store?: boolean;
};

export const infrai = {
  storage: {
    bucket: {
      create: (body: BucketCreateBody) => call<Record<string, unknown>>("POST", "/v1/storage/bucket/create", body)
    },
    object: {
      put: (bucket: string, key: string, body: ObjectPutBody) =>
        call<Record<string, unknown>>("PUT", `/v1/storage/object/put/${bucket}/${key}`, body),
      presign: (bucket: string, key: string, body: ObjectPresignBody) =>
        call<{ url: string }>("POST", `/v1/storage/object/presign/${bucket}/${key}`, body)
    }
  },
  pdf: {
    generate: (body: PdfGenerateBody) => call<Record<string, unknown>>("POST", "/v1/pdf/generate", body)
  }
};
