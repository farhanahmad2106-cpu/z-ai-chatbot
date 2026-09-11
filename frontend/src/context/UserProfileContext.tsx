import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { API_BASE } from '../config';

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
  loadingProfile: boolean;
  updateHealthProfile: (data: Partial<HealthProfile>) => Promise<boolean>;
  updatePreferences: (data: Partial<Preferences>) => Promise<boolean>;
  updateSettings: (data: Partial<Settings>) => Promise<boolean>;
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
  const [loadingProfile, setLoadingProfile] = useState(false);

  useEffect(() => {
    if (currentUser) {
      fetchProfile();
    } else {
      setHealthProfile(defaultHealth);
      setPreferences(defaultPreferences);
      setSettings(defaultSettings);
    }
  }, [currentUser]);

  const fetchProfile = async () => {
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
      }
    } catch (error) {
      console.error("Failed to fetch user profile", error);
    } finally {
      setLoadingProfile(false);
    }
  };

  const updateProfileData = async (payload: any): Promise<boolean> => {
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
    return updateProfileData({ health_profile: newProfile });
  };

  const updatePreferences = async (data: Partial<Preferences>) => {
    const newPrefs = { ...preferences, ...data };
    setPreferences(newPrefs);
    return updateProfileData({ preferences: newPrefs });
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
    loadingProfile,
    updateHealthProfile,
    updatePreferences,
    updateSettings
  };

  return (
    <UserProfileContext.Provider value={value}>
      {children}
    </UserProfileContext.Provider>
  );
}
