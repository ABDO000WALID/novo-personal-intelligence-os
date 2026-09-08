import { NOVOContext } from '../intelligence/intelligenceTypes';
import {
  AIMessage,
  AIRequestOptions,
  AIResponse,
  AIStreamChunk,
  AIProviderType,
} from './aiTypes';

/**
 * AI Provider Abstraction Interface
 *
 * Designed to prepare NOVO for future pluggable intelligence models (Gemini,
 * OpenAI, or Local WebLLM models) without modifying existing UI modules.
 *
 * NOTE: CURRENT APPLICATION REMAINS STRICTLY OFFLINE.
 * No SDKs, no external network calls, no API keys.
 */
export interface AIProvider {
  readonly id: string;
  readonly name: string;
  readonly providerType: AIProviderType;
  readonly supportedModels: string[];

  /**
   * Checks if the provider is configured and available for execution.
   */
  isAvailable(): boolean;

  /**
   * Generates a grounded response incorporating local NOVO context snapshot.
   */
  generateResponse(
    prompt: string,
    context: NOVOContext,
    options?: AIRequestOptions
  ): Promise<AIResponse>;

  /**
   * Optional streaming response handler for real-time generative responses.
   */
  streamResponse?(
    prompt: string,
    context: NOVOContext,
    onChunk: (chunk: AIStreamChunk) => void,
    options?: AIRequestOptions
  ): Promise<AIResponse>;
}

/**
 * Pluggable AI Provider Registry
 * Allows dynamic registration of future AI backends without touching React tree.
 */
class AIProviderRegistryService {
  private providers: Map<string, AIProvider> = new Map();
  private activeProviderId: string | null = null;

  register(provider: AIProvider): void {
    this.providers.set(provider.id, provider);
    if (!this.activeProviderId) {
      this.activeProviderId = provider.id;
    }
  }

  get(id: string): AIProvider | undefined {
    return this.providers.get(id);
  }

  getActiveProvider(): AIProvider | undefined {
    if (!this.activeProviderId) return undefined;
    return this.providers.get(this.activeProviderId);
  }

  setActiveProvider(id: string): boolean {
    if (this.providers.has(id)) {
      this.activeProviderId = id;
      return true;
    }
    return false;
  }

  listProviders(): Array<{ id: string; name: string; type: AIProviderType }> {
    return Array.from(this.providers.values()).map((p) => ({
      id: p.id,
      name: p.name,
      type: p.providerType,
    }));
  }
}

export const aiProviderRegistry = new AIProviderRegistryService();
