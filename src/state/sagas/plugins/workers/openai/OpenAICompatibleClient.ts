import { z } from 'zod';

import { LLMClient, LLMRequest, LLMResponse } from './types';

interface OpenAICompatibleClientOptions {
  apiKey: string;
  baseURL: string;

  /**
   * Nombre maximum de tentatives.
   * 1 = aucune nouvelle tentative après le premier appel.
   */
  maxRetries?: number;

  /**
   * Délai initial entre les tentatives, en ms.
   */
  initialRetryDelay?: number;

  /**
   * Délai maximum entre les tentatives, en ms.
   */
  maxRetryDelay?: number;

  /**
   * Timeout d'une requête HTTP, en ms.
   */
  timeout?: number;
}

const OpenAIErrorResponseSchema = z.object({
  error: z
    .object({
      message: z.string().optional(),
      type: z.string().optional(),
      code: z.union([z.string(), z.number()]).optional(),
      param: z.string().nullable().optional(),
    })
    .optional(),
});

const OpenAIChatCompletionResponseSchema = z.object({
  id: z.string().optional(),
  object: z.string().optional(),
  created: z.number().optional(),
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        index: z.number().optional(),
        message: z
          .object({
            role: z.string().optional(),
            content: z.string().nullable().optional(),
          })
          .optional(),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .optional(),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
      total_tokens: z.number().optional(),
    })
    .optional(),
});

type OpenAIChatCompletionResponse = z.infer<typeof OpenAIChatCompletionResponseSchema>;

export class OpenAICompatibleClient implements LLMClient {
  private readonly apiKey: string;
  private readonly baseURL: string;

  private readonly maxRetries: number;
  private readonly initialRetryDelay: number;
  private readonly maxRetryDelay: number;
  private readonly timeout: number;

  constructor(options: OpenAICompatibleClientOptions) {
    this.apiKey = options.apiKey;
    this.baseURL = options.baseURL.replace(/\/+$/, '');

    this.maxRetries = options.maxRetries ?? 3;
    this.initialRetryDelay = options.initialRetryDelay ?? 500;
    this.maxRetryDelay = options.maxRetryDelay ?? 30_000;
    this.timeout = options.timeout ?? 120_000;
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    let attempt = 0;

    while (true) {
      try {
        return await this.executeRequest(request);
      } catch (error) {
        if (!this.shouldRetry(error, attempt)) {
          throw error;
        }

        const delay = this.getRetryDelay(attempt);

        console.warn(
          `LLM request failed. Retrying in ${delay}ms ` +
            `(attempt ${attempt + 1}/${this.maxRetries})`,
          error,
        );

        await this.sleep(delay);

        attempt++;
      }
    }
  }

  private async executeRequest(request: LLMRequest): Promise<LLMResponse> {
    const controller = new AbortController();

    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, this.timeout);

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },

        body: JSON.stringify({
          model: request.model,
          messages: request.messages,

          ...(request.temperature !== undefined && {
            temperature: request.temperature,
          }),

          ...(request.maxTokens !== undefined && {
            max_tokens: request.maxTokens,
          }),

          ...(request.responseFormat !== undefined && {
            response_format: request.responseFormat,
          }),
        }),

        signal: controller.signal,
      });

      if (!response.ok) {
        throw await this.createHttpError(response);
      }

      const dataValidation = OpenAIChatCompletionResponseSchema.safeParse(await response.json());
      if (dataValidation.success === false) {
        throw new LLMResponseError(
          `LLM returned an invalid response: ${dataValidation.error.message}`,
        );
      }

      return this.parseResponse(dataValidation.data);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new LLMRequestError(`LLM request timed out after ${this.timeout}ms`, {
          retryable: true,
          cause: error,
        });
      }

      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  private async createHttpError(response: Response): Promise<LLMRequestError> {
    let errorMessage = `LLM API request failed with status ${response.status}`;

    try {
      const errorData = OpenAIErrorResponseSchema.parse(await response.json());

      if (errorData.error?.message !== undefined) {
        errorMessage += `: ${errorData.error.message}`;
      }

      return new LLMRequestError(errorMessage, {
        status: response.status,
        code: errorData.error?.code,
        type: errorData.error?.type,
        retryable: this.isRetryableStatus(response.status),
      });
    } catch {
      // La réponse n'est pas du JSON.
      return new LLMRequestError(errorMessage, {
        status: response.status,
        retryable: this.isRetryableStatus(response.status),
      });
    }
  }

  private parseResponse(data: OpenAIChatCompletionResponse): LLMResponse {
    console.log('data: ', data);

    const content = data.choices?.[0]?.message?.content;

    if (typeof content !== 'string') {
      throw new LLMResponseError('LLM returned an empty or invalid response');
    }

    return {
      content,
    };
  }

  private shouldRetry(error: unknown, attempt: number): boolean {
    if (attempt >= this.maxRetries) {
      return false;
    }

    if (error instanceof LLMRequestError) {
      return error.retryable;
    }

    /*
     * Les erreurs réseau (fetch failed, DNS, connexion interrompue...)
     * sont généralement considérées comme temporaires.
     */
    if (error instanceof TypeError) {
      return true;
    }

    return false;
  }

  private isRetryableStatus(status: number): boolean {
    /*
     * 408 Request Timeout
     * 409 Conflict (certains providers l'utilisent temporairement)
     * 429 Too Many Requests
     * 500 Internal Server Error
     * 502 Bad Gateway
     * 503 Service Unavailable
     * 504 Gateway Timeout
     */
    return (
      status === 408 ||
      status === 409 ||
      status === 429 ||
      status === 500 ||
      status === 502 ||
      status === 503 ||
      status === 504
    );
  }

  private getRetryDelay(attempt: number): number {
    const exponentialDelay = this.initialRetryDelay * Math.pow(1.5, attempt);

    return Math.min(exponentialDelay, this.maxRetryDelay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }
}

export class LLMRequestError extends Error {
  readonly status?: number;
  readonly code?: string | number;
  readonly type?: string;
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(
    message: string,
    options?: {
      status?: number;
      code?: string | number;
      type?: string;
      retryable?: boolean;
      cause?: unknown;
    },
  ) {
    super(message);

    this.name = 'LLMRequestError';

    this.status = options?.status;
    this.code = options?.code;
    this.type = options?.type;
    this.retryable = options?.retryable ?? false;

    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export class LLMResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLMResponseError';
  }
}
