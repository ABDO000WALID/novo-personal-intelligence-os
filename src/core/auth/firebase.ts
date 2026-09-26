/// <reference types="vite/client" />
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const clean = (val?: string) => (val ? val.replace(/^["']|["']$/g, '').trim() : val);

const firebaseConfig = {
  apiKey: clean(import.meta.env?.VITE_FIREBASE_API_KEY),
  authDomain: clean(import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: clean(import.meta.env?.VITE_FIREBASE_PROJECT_ID),
  storageBucket: clean(import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: clean(import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: clean(import.meta.env?.VITE_FIREBASE_APP_ID),
};

// Initialize Firebase only if config exists and app isn't already initialized
export const app = getApps().length === 0 && firebaseConfig.apiKey 
  ? initializeApp(firebaseConfig) 
  : getApps().length > 0 ? getApp() : null;

export const auth = app ? getAuth(app) : null;
