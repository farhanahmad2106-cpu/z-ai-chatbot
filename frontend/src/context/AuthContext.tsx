/* eslint-disable @typescript-eslint/no-unused-vars */
import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut, updateProfile } from 'firebase/auth';
import { auth } from '../firebase';

interface AuthContextType {
  currentUser: any | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  updateUserProfile: (data: { displayName?: string; photoURL?: string }) => Promise<void>;
  showLoginModal: boolean;
  setShowLoginModal: (show: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);

  useEffect(() => {
    try {
      const unsubscribe = onAuthStateChanged(
        auth, 
        async (user: any | null) => {
          setCurrentUser(user);
          setLoading(false);
          
          if (user) {
            setShowLoginModal(false);
            try {
              const token = await user.getIdToken();
              const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
              await fetch(`${API_BASE}/api/auth/sync`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ token })
              });
            } catch (error) {
              console.error("Failed to sync user with backend:", error);
            }
          }
        },
        (error: Error) => {
          console.warn("[AuthContext] Firebase auth listener warning:", error);
          setLoading(false);
        }
      );

      return unsubscribe;
    } catch (e) {
      console.warn("[AuthContext] Unable to initialize auth listener:", e);
      setLoading(false);
    }
  }, []);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Error signing in with Google', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out', error);
    }
  };

  const updateUserProfile = async (data: { displayName?: string; photoURL?: string }) => {
    if (!auth.currentUser) return;
    try {
      await updateProfile(auth.currentUser, data);
      // Force refresh user state in app
      setCurrentUser({ ...auth.currentUser } as any);
      
      const token = await auth.currentUser.getIdToken();
      const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      await fetch(`${API_BASE}/api/auth/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token })
      });
    } catch (error) {
      console.error("Failed to update user profile:", error);
      throw error;
    }
  };

  const value = {
    currentUser,
    loading,
    signInWithGoogle,
    logout,
    updateUserProfile,
    showLoginModal,
    setShowLoginModal
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
