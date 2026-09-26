import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initializeAIProviders } from './core/ai/providers';
import { initFirebaseAuth } from './core/auth/initAuth';

initializeAIProviders();
initFirebaseAuth();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
