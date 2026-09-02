/// <reference types="vite/client" />

// Declarations for modules lacking type definitions
declare module 'lucide-react';
declare module 'firebase/app';
declare module 'firebase/auth';
declare module 'react-dom/client';

// Vite env typings
interface ImportMetaEnv {
  VITE_API_URL: string;
  VITE_FIREBASE_API_KEY?: string;
  VITE_FIREBASE_AUTH_DOMAIN?: string;
  VITE_FIREBASE_PROJECT_ID?: string;
  VITE_FIREBASE_STORAGE_BUCKET?: string;
  VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  VITE_FIREBASE_APP_ID?: string;
  VITE_FIREBASE_MEASUREMENT_ID?: string;
  VITE_RAZORPAY_KEY_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
