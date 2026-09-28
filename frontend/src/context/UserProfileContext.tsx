import { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { API_BASE } from '../config';
import { HEALTH_VAULT_CONSENT_KEY, HEALTH_VAULT_CONSENT_VERSION } from '../constants/compliance';

export interface ConsentRecord {
  status: 'granted' | 'withdrawn';
  version: string;
  timestamp: string;
  mechanism?: string;
  withdrawal_timestamp?: string | null;
}

export interface HealthProfile {
  age: number | string;
  gender: string;
  height: number | string;
  weight: number | string;
  activityLevel?: string;
  healthGoal?: string;
  targetWater?: number | string;
  dailyCalorieTarget?: number | string;
  bloodType?: string;
  medicalConditions?: string;
  targetWeight?: number | string;
  sleepDuration?: number | string;
}

export interface Preferences {
  diet: string;
  allergies: string[];
}

export interface Settings {
  notificationsEnabled: boolean;
  darkMode: boolean;
  language: string;
}

interface UserProfileContextType {
  healthProfile: HealthProfile;
  preferences: Preferences;
  settings: Settings;
  consentRecord: ConsentRecord | null;
  hasValidHealthConsent: boolean;
  loadingProfile: boolean;
  updateHealthProfile: (data: Partial<HealthProfile>) => Promise<boolean>;
  updatePreferences: (data: Partial<Preferences>) => Promise<boolean>;
  updateSettings: (data: Partial<Settings>) => Promise<boolean>;
  recordConsent: (action: 'granted' | 'withdrawn', mechanism?: string) => Promise<boolean>;
  deleteHealthProfile: () => Promise<boolean>;
}

const defaultHealth: HealthProfile = { 
  age: '', 
  gender: '', 
  height: '', 
  weight: '',
  activityLevel: 'Moderately Active',
  healthGoal: 'Healthy Lifestyle',
  targetWater: '2.5',
  dailyCalorieTarget: '2000'
};
const defaultPreferences: Preferences = { diet: 'None', allergies: [] };
const defaultSettings: Settings = { notificationsEnabled: true, darkMode: true, language: 'English' };

const UserProfileContext = createContext<UserProfileContextType | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export function useUserProfile() {
  const context = useContext(UserProfileContext);
  if (context === undefined) {
    throw new Error('useUserProfile must be used within a UserProfileProvider');
  }
  return context;
}

export function UserProfileProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  
  const [healthProfile, setHealthProfile] = useState<HealthProfile>(defaultHealth);
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [consentRecord, setConsentRecord] = useState<ConsentRecord | null>(() => {
    // Initial cache check
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(HEALTH_VAULT_CONSENT_KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) {
        console.warn('Failed to parse local consent cache', e);
      }
    }
    return null;
  });
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Server state takes precedence; local state is synchronization/performance aid
  const hasValidHealthConsent = useMemo(() => {
    if (consentRecord) {
      return (
        consentRecord.status === 'granted' &&
        consentRecord.version === HEALTH_VAULT_CONSENT_VERSION
      );
    }
    return false;
  }, [consentRecord]);

  const fetchProfile = useCallback(async () => {
    if (!currentUser) return;
    setLoadingProfile(true);
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`${API_BASE}/api/user/profile`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setHealthProfile({ ...defaultHealth, ...(data.health_profile || {}) });
        setPreferences({ ...defaultPreferences, ...(data.preferences || {}) });
        setSettings({ ...defaultSettings, ...(data.settings || {}) });
        
        // Sync consent from server
        if (data.health_vault_consent) {
          const serverConsent: ConsentRecord = data.health_vault_consent;
          setConsentRecord(serverConsent);
          if (typeof window !== 'undefined') {
            if (serverConsent.status === 'granted' && serverConsent.version === HEALTH_VAULT_CONSENT_VERSION) {
              localStorage.setItem(HEALTH_VAULT_CONSENT_KEY, JSON.stringify(serverConsent));
            } else {
              localStorage.removeItem(HEALTH_VAULT_CONSENT_KEY);
            }
          }
        } else {
          setConsentRecord(null);
          if (typeof window !== 'undefined') {
            localStorage.removeItem(HEALTH_VAULT_CONSENT_KEY);
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch user profile", error);
    } finally {
      setLoadingProfile(false);
    }
  }, [currentUser]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (currentUser) {
      timer = setTimeout(() => {
        fetchProfile();
      }, 0);
    } else {
      timer = setTimeout(() => {
        setHealthProfile(defaultHealth);
        setPreferences(defaultPreferences);
        setSettings(defaultSettings);
        setConsentRecord(null);
        if (typeof window !== 'undefined') {
          localStorage.removeItem(HEALTH_VAULT_CONSENT_KEY);
        }
      }, 0);
    }
    return () => { if (timer) clearTimeout(timer); };
  }, [currentUser, fetchProfile]);

  const recordConsent = async (action: 'granted' | 'withdrawn', mechanism: string = 'health_vault_modal_checkbox'): Promise<boolean> => {
    if (!currentUser) return false;
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`${API_BASE}/api/user/consent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          consent_type: 'health_vault',
          version: HEALTH_VAULT_CONSENT_VERSION,
          action,
          mechanism
        })
      });
      if (response.ok) {
        const data = await response.json();
        const updatedConsent: ConsentRecord = data.consent;
        setConsentRecord(updatedConsent);
        if (typeof window !== 'undefined') {
          if (action === 'granted') {
            localStorage.setItem(HEALTH_VAULT_CONSENT_KEY, JSON.stringify(updatedConsent));
          } else {
            localStorage.removeItem(HEALTH_VAULT_CONSENT_KEY);
          }
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error("Failed to record consent", error);
      return false;
    }
  };

  const deleteHealthProfile = async (): Promise<boolean> => {
    if (!currentUser) return false;
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`${API_BASE}/api/user/health-profile`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        setHealthProfile(defaultHealth);
        setPreferences(prev => ({ ...prev, allergies: [] }));
        const withdrawnConsent: ConsentRecord = {
          status: 'withdrawn',
          version: HEALTH_VAULT_CONSENT_VERSION,
          timestamp: new Date().toISOString(),
          mechanism: 'delete_health_profile_button',
          withdrawal_timestamp: new Date().toISOString()
        };
        setConsentRecord(withdrawnConsent);
        if (typeof window !== 'undefined') {
          localStorage.removeItem(HEALTH_VAULT_CONSENT_KEY);
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error("Failed to delete health profile", error);
      return false;
    }
  };

  const updateProfileData = async (payload: Record<string, unknown>): Promise<boolean> => {
    if (!currentUser) return false;
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`${API_BASE}/api/user/profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      return response.ok;
    } catch (error) {
      console.error("Failed to update profile", error);
      return false;
    }
  };

  const updateHealthProfile = async (data: Partial<HealthProfile>) => {
    const newProfile = { ...healthProfile, ...data };
    setHealthProfile(newProfile); // optimistic UI
    const ok = await updateProfileData({ health_profile: newProfile });
    if (!ok) {
      // Revert if failed
      fetchProfile();
    }
    return ok;
  };

  const updatePreferences = async (data: Partial<Preferences>) => {
    const newPrefs = { ...preferences, ...data };
    setPreferences(newPrefs);
    const ok = await updateProfileData({ preferences: newPrefs });
    if (!ok) {
      fetchProfile();
    }
    return ok;
  };

  const updateSettings = async (data: Partial<Settings>) => {
    const newSettings = { ...settings, ...data };
    setSettings(newSettings);
    return updateProfileData({ settings: newSettings });
  };

  const value = {
    healthProfile,
    preferences,
    settings,
    consentRecord,
    hasValidHealthConsent,
    loadingProfile,
    updateHealthProfile,
    updatePreferences,
    updateSettings,
    recordConsent,
    deleteHealthProfile
  };

  return (
    <UserProfileContext.Provider value={value}>
      {children}
    </UserProfileContext.Provider>
  );
}
