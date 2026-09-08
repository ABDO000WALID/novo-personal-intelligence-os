import { aiProviderRegistry } from './aiProvider';
import { GeminiServerProvider } from './geminiServerProvider';

let isRegistered = false;

export function initializeAIProviders() {
  if (isRegistered) return;
  isRegistered = true;

  const geminiProvider = new GeminiServerProvider();
  aiProviderRegistry.register(geminiProvider);
  aiProviderRegistry.setActiveProvider(geminiProvider.id);
}
