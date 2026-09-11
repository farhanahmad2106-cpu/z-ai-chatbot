import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useUserProfile } from '../context/UserProfileContext';
import { useToast } from '../context/ToastContext';
import { 
  User, 
  Mail, 
  Calendar, 
  Activity, 
  Shield, 
  Edit2, 
  ArrowLeft, 
  X, 
  Upload, 
  Link as LinkIcon, 
  Utensils,
  Plus,
  Sparkles
} from 'lucide-react';
import SubscriptionBadge from './SubscriptionBadge';

interface ProfileProps {
  onBack?: () => void;
  onGoToPricing?: () => void;
}

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80',
  'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=256&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=256&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=256&q=80',
];

const COMMON_DIETS = [
  'None',
  'Vegetarian',
  'Vegan',
  'Keto',
  'Halal',
  'Gluten-Free',
  'Low Carb',
  'Paleo',
];

const COMMON_ALLERGIES = [
  'Dairy',
  'Nuts',
  'Peanuts',
  'Eggs',
  'Soy',
  'Shellfish',
  'Wheat',
  'Gluten',
  'Sesame',
  'Fish',
];

const Profile: React.FC<ProfileProps> = ({ onBack, onGoToPricing }) => {
  const { currentUser, updateUserProfile } = useAuth();
  const { healthProfile, updateHealthProfile, preferences, updatePreferences } = useUserProfile();
  const { showToast } = useToast();

  // --- Health Profile Modal State & Calculator ---
  const [isHealthModalOpen, setIsHealthModalOpen] = useState(false);
  const [isSavingHealth, setIsSavingHealth] = useState(false);
  const [localHealth, setLocalHealth] = useState(healthProfile);

  useEffect(() => {
    setLocalHealth(healthProfile);
  }, [healthProfile]);

  const calculateBMI = (heightCm: number | string, weightKg: number | string) => {
    const h = Number(heightCm) / 100;
    const w = Number(weightKg);
    if (!h || !w || h <= 0 || w <= 0) return null;
    const bmi = Number((w / (h * h)).toFixed(1));
    let category = 'Normal';
    let color = 'text-emerald-400';
    if (bmi < 18.5) { category = 'Underweight'; color = 'text-amber-400'; }
    else if (bmi < 25) { category = 'Healthy Weight'; color = 'text-emerald-400'; }
    else if (bmi < 30) { category = 'Overweight'; color = 'text-amber-400'; }
    else { category = 'Obese'; color = 'text-rose-400'; }
    return { bmi, category, color };
  };

  const handleOpenHealthModal = () => {
    setLocalHealth(healthProfile);
    setIsHealthModalOpen(true);
  };

  const handleSaveHealth = async () => {
    setIsSavingHealth(true);
    try {
      await updateHealthProfile(localHealth);
      setIsHealthModalOpen(false);
      showToast('Health profile updated successfully!');
    } catch (err) {
      console.error(err);
      showToast('Failed to update health profile.');
    } finally {
      setIsSavingHealth(false);
    }
  };

  // --- Photo Modal State ---
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [photoUrlInput, setPhotoUrlInput] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [isUpdatingPhoto, setIsUpdatingPhoto] = useState(false);

  const handleOpenPhotoModal = () => {
    setSelectedPhoto(currentUser?.photoURL || null);
    setPhotoUrlInput(currentUser?.photoURL || '');
    setIsPhotoModalOpen(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setSelectedPhoto(reader.result);
          setPhotoUrlInput(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSavePhoto = async () => {
    const finalUrl = photoUrlInput.trim() || selectedPhoto;
    if (!finalUrl) return;
    setIsUpdatingPhoto(true);
    try {
      await updateUserProfile({ photoURL: finalUrl });
      setIsPhotoModalOpen(false);
      showToast('Profile photo updated successfully!');
    } catch (err) {
      console.error(err);
      showToast('Failed to update photo.');
    } finally {
      setIsUpdatingPhoto(false);
    }
  };

  // --- Dietary Preferences Modal State ---
  const [isDietModalOpen, setIsDietModalOpen] = useState(false);
  const [selectedDiet, setSelectedDiet] = useState(preferences.diet || 'None');
  const [selectedAllergies, setSelectedAllergies] = useState<string[]>(preferences.allergies || []);
  const [customAllergy, setCustomAllergy] = useState('');
  const [isSavingDiet, setIsSavingDiet] = useState(false);

  useEffect(() => {
    setSelectedDiet(preferences.diet || 'None');
    setSelectedAllergies(preferences.allergies || []);
  }, [preferences]);

  const toggleAllergy = (allergy: string) => {
    if (selectedAllergies.includes(allergy)) {
      setSelectedAllergies(selectedAllergies.filter(a => a !== allergy));
    } else {
      setSelectedAllergies([...selectedAllergies, allergy]);
    }
  };

  const handleAddCustomAllergy = () => {
    const trimmed = customAllergy.trim();
    if (trimmed && !selectedAllergies.includes(trimmed)) {
      setSelectedAllergies([...selectedAllergies, trimmed]);
      setCustomAllergy('');
    }
  };

  const handleSaveDietaryPreferences = async () => {
    setIsSavingDiet(true);
    try {
      await updatePreferences({
        diet: selectedDiet,
        allergies: selectedAllergies,
      });
      setIsDietModalOpen(false);
      showToast('Dietary preferences updated!');
    } catch (err) {
      console.error(err);
      showToast('Failed to save dietary preferences.');
    } finally {
      setIsSavingDiet(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Please Log In</h2>
        <p className="text-gray-400">You need to be logged in to view your profile.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
      {onBack && (
        <button onClick={onBack} className="mb-6 flex items-center gap-2 text-gray-400 hover:text-white transition-colors cursor-pointer">
          <ArrowLeft className="w-5 h-5" /> Back to Dashboard
        </button>
      )}

      <div className="mb-8 flex items-center justify-between gap-4">
        <h2 className="text-3xl font-outfit font-bold text-white flex items-center gap-3">
          <User className="w-8 h-8 text-emerald-500" />
          Personal Details
        </h2>
        <SubscriptionBadge variant="full" onUpgradeClick={onGoToPricing} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Profile Card */}
        <div className="col-span-1 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col items-center text-center relative overflow-hidden group">
          <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
          
          <div className="w-32 h-32 rounded-full bg-slate-800 border-4 border-slate-700 flex items-center justify-center overflow-hidden mb-4 relative group/photo">
            {currentUser.photoURL ? (
              <img src={currentUser.photoURL} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <User className="w-12 h-12 text-gray-400" />
            )}
            <button 
              onClick={handleOpenPhotoModal}
              className="absolute bottom-0 inset-x-0 bg-black/70 hover:bg-black/90 text-white text-xs py-1.5 transition-all flex items-center justify-center gap-1 font-bold cursor-pointer opacity-90 group-hover/photo:opacity-100 border-0"
            >
              <Edit2 className="w-3.5 h-3.5 text-emerald-400" /> Edit Photo
            </button>
          </div>
          
          <h3 className="text-xl font-bold text-white mb-1">
            {currentUser.displayName || 'No Name Set'}
          </h3>
          <p className="text-gray-400 text-sm flex items-center justify-center gap-1 mb-4">
            <Mail className="w-4 h-4 text-emerald-500/80" /> {currentUser.email}
          </p>
          
          <div className="w-full pt-4 border-t border-slate-800 flex justify-between text-sm">
            <div className="text-center w-full">
              <p className="text-gray-400 mb-1">Status</p>
              <p className="font-bold text-emerald-400 flex items-center justify-center gap-1">
                <Shield className="w-4 h-4" /> Active
              </p>
            </div>
            <div className="w-px bg-slate-800"></div>
            <div className="text-center w-full">
              <p className="text-gray-400 mb-1">Joined</p>
              <p className="font-bold text-white flex items-center justify-center gap-1">
                <Calendar className="w-4 h-4 text-blue-400" /> {new Date(currentUser.metadata.creationTime || Date.now()).getFullYear()}
              </p>
            </div>
          </div>
        </div>

        {/* Health Profile Overview */}
        <div className="col-span-1 md:col-span-2 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-500" />
                Health Profile Overview
              </h3>
              {(() => {
                const bmiData = calculateBMI(healthProfile.height, healthProfile.weight);
                return bmiData ? (
                  <span className={`text-xs font-bold px-3 py-1 rounded-full bg-slate-800 border border-slate-700 ${bmiData.color}`}>
                    BMI {bmiData.bmi} • {bmiData.category}
                  </span>
                ) : null;
              })()}
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="bg-slate-800/50 p-3.5 rounded-2xl border border-slate-700/50 text-left">
                <p className="text-xs text-gray-400 mb-1">Age</p>
                <p className="text-lg font-bold text-white">{healthProfile.age ? `${healthProfile.age} yrs` : '--'}</p>
              </div>

              <div className="bg-slate-800/50 p-3.5 rounded-2xl border border-slate-700/50 text-left">
                <p className="text-xs text-gray-400 mb-1">Gender</p>
                <p className="text-lg font-bold text-white">{healthProfile.gender || '--'}</p>
              </div>

              <div className="bg-slate-800/50 p-3.5 rounded-2xl border border-slate-700/50 text-left">
                <p className="text-xs text-gray-400 mb-1">Height</p>
                <p className="text-lg font-bold text-white">{healthProfile.height ? `${healthProfile.height} cm` : '--'}</p>
              </div>

              <div className="bg-slate-800/50 p-3.5 rounded-2xl border border-slate-700/50 text-left">
                <p className="text-xs text-gray-400 mb-1">Weight</p>
                <p className="text-lg font-bold text-white">{healthProfile.weight ? `${healthProfile.weight} kg` : '--'}</p>
              </div>
            </div>

            {/* Additional Credentials Summary Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div className="bg-slate-800/30 p-3 rounded-2xl border border-slate-700/30 text-left">
                <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Activity Level</p>
                <p className="text-xs font-bold text-emerald-400">{healthProfile.activityLevel || 'Moderately Active'}</p>
              </div>
              <div className="bg-slate-800/30 p-3 rounded-2xl border border-slate-700/30 text-left">
                <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Health Goal</p>
                <p className="text-xs font-bold text-blue-400">{healthProfile.healthGoal || 'Healthy Lifestyle'}</p>
              </div>
              <div className="bg-slate-800/30 p-3 rounded-2xl border border-slate-700/30 text-left">
                <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Daily Target Water</p>
                <p className="text-xs font-bold text-cyan-400">{healthProfile.targetWater || '2.5'} Liters / day</p>
              </div>
            </div>

            {(healthProfile.bloodType || healthProfile.medicalConditions || healthProfile.targetWeight || healthProfile.sleepDuration) && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 pt-4 border-t border-slate-800/50">
                {healthProfile.bloodType && (
                  <div className="bg-slate-800/20 p-3 rounded-2xl border border-slate-700/20 text-left">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Blood Type</p>
                    <p className="text-sm font-bold text-rose-400">{healthProfile.bloodType}</p>
                  </div>
                )}
                {healthProfile.targetWeight && (
                  <div className="bg-slate-800/20 p-3 rounded-2xl border border-slate-700/20 text-left">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Target Weight</p>
                    <p className="text-sm font-bold text-purple-400">{healthProfile.targetWeight} kg</p>
                  </div>
                )}
                {healthProfile.sleepDuration && (
                  <div className="bg-slate-800/20 p-3 rounded-2xl border border-slate-700/20 text-left">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Sleep Target</p>
                    <p className="text-sm font-bold text-indigo-400">{healthProfile.sleepDuration} hrs</p>
                  </div>
                )}
                {healthProfile.medicalConditions && (
                  <div className="col-span-2 sm:col-span-1 bg-slate-800/20 p-3 rounded-2xl border border-slate-700/20 text-left">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Conditions</p>
                    <p className="text-xs font-medium text-gray-300 truncate" title={healthProfile.medicalConditions}>{healthProfile.medicalConditions}</p>
                  </div>
                )}
              </div>
            )}
            
            <button 
              onClick={handleOpenHealthModal} 
              className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold transition-all border border-slate-700 w-full flex items-center justify-center gap-2 cursor-pointer hover:border-emerald-500/50 active:scale-95 shadow-sm"
            >
              <Edit2 className="w-4 h-4 text-emerald-400" /> Edit Health Profile Credentials
            </button>
          </div>

          {/* Dietary Preferences Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                <Utensils className="w-5 h-5 text-emerald-400" /> Dietary Preferences & Allergy Flags
              </h3>
              <p className="text-xs text-gray-400 mb-3">
                Active across <span className="text-emerald-400 font-bold">Dashboard</span>, <span className="text-emerald-400 font-bold">Food Search</span> & <span className="text-emerald-400 font-bold">AI Label Scans</span> for instant allergen warnings.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  Diet: {preferences.diet || 'None'}
                </span>
                {preferences.allergies && preferences.allergies.length > 0 ? (
                  preferences.allergies.map(allergy => (
                    <span key={allergy} className="text-xs font-bold px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/20">
                      ⚠️ Allergy: {allergy}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-gray-500">No allergies set</span>
                )}
              </div>
            </div>
            <button 
              onClick={() => setIsDietModalOpen(true)}
              className="px-4 py-2.5 bg-emerald-600/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-xl text-sm font-bold transition-all cursor-pointer whitespace-nowrap active:scale-95"
            >
              Configure
            </button>
          </div>
        </div>
      </div>

      {/* --- Edit Photo Modal --- */}
      {isPhotoModalOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative">
            <button 
              onClick={() => setIsPhotoModalOpen(false)}
              className="absolute top-5 right-5 text-gray-400 hover:text-white p-2 rounded-full hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold font-outfit text-white mb-2 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-400" /> Change Profile Photo
            </h3>
            <p className="text-xs text-gray-400 mb-6">Choose a avatar preset, paste an image URL, or upload a file.</p>

            {/* Photo Preview */}
            <div className="flex justify-center mb-6">
              <div className="w-24 h-24 rounded-full bg-slate-800 border-4 border-emerald-500/40 overflow-hidden shadow-xl flex items-center justify-center">
                {selectedPhoto ? (
                  <img src={selectedPhoto} alt="Selected" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-10 h-10 text-gray-400" />
                )}
              </div>
            </div>

            {/* Avatar Presets */}
            <div className="mb-6">
              <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Preset Avatars</label>
              <div className="flex gap-3 justify-center">
                {PRESET_AVATARS.map((url, idx) => (
                  <button
                    key={idx}
                    onClick={() => { setSelectedPhoto(url); setPhotoUrlInput(url); }}
                    className={`w-10 h-10 rounded-full border-2 overflow-hidden transition-all cursor-pointer ${selectedPhoto === url ? 'border-emerald-500 scale-110' : 'border-slate-700 opacity-70 hover:opacity-100'}`}
                  >
                    <img src={url} alt={`Preset ${idx + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            {/* Option 1: File Upload */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Upload Image File</label>
              <label className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-dashed border-slate-600 rounded-xl cursor-pointer text-xs font-semibold text-gray-300 transition-colors">
                <Upload className="w-4 h-4 text-emerald-400" />
                <span>Choose File from Device</span>
                <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>

            {/* Option 2: Image URL */}
            <div className="mb-6">
              <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Or Image URL</label>
              <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2">
                <LinkIcon className="w-4 h-4 text-gray-400" />
                <input 
                  type="url" 
                  value={photoUrlInput} 
                  onChange={e => { setPhotoUrlInput(e.target.value); setSelectedPhoto(e.target.value); }}
                  placeholder="https://example.com/avatar.jpg"
                  className="bg-transparent flex-1 text-xs text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={handleSavePhoto}
                disabled={isUpdatingPhoto}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-all active:scale-95 cursor-pointer shadow-lg shadow-emerald-950/40"
              >
                {isUpdatingPhoto ? 'Updating...' : 'Save Profile Photo'}
              </button>
              <button 
                onClick={() => setIsPhotoModalOpen(false)}
                className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Configure Dietary Preferences Modal --- */}
      {isDietModalOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => setIsDietModalOpen(false)}
              className="absolute top-5 right-5 text-gray-400 hover:text-white p-2 rounded-full hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold font-outfit text-white mb-2 flex items-center gap-2">
              <Utensils className="w-5 h-5 text-emerald-400" /> Configure Dietary Preferences
            </h3>
            <p className="text-xs text-gray-400 mb-6">Select your diet type and flag any food allergies.</p>

            {/* Diet Selection */}
            <div className="mb-6">
              <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Primary Diet Type</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {COMMON_DIETS.map(diet => (
                  <button
                    key={diet}
                    onClick={() => setSelectedDiet(diet)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border cursor-pointer ${selectedDiet === diet ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500' : 'bg-slate-800/80 text-gray-400 border-slate-700 hover:text-white'}`}
                  >
                    {diet}
                  </button>
                ))}
              </div>
            </div>

            {/* Allergy Toggles */}
            <div className="mb-6">
              <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Food Allergies & Restrictions</label>
              <div className="flex flex-wrap gap-2 mb-3">
                {COMMON_ALLERGIES.map(allergy => {
                  const isSelected = selectedAllergies.includes(allergy);
                  return (
                    <button
                      key={allergy}
                      onClick={() => toggleAllergy(allergy)}
                      className={`py-1.5 px-3 rounded-full text-xs font-bold transition-all border cursor-pointer ${isSelected ? 'bg-rose-500/20 text-rose-300 border-rose-500' : 'bg-slate-800/80 text-gray-400 border-slate-700 hover:text-white'}`}
                    >
                      {isSelected ? `✓ ${allergy}` : `+ ${allergy}`}
                    </button>
                  );
                })}
              </div>

              {/* Add Custom Allergy */}
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={customAllergy} 
                  onChange={e => setCustomAllergy(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddCustomAllergy()}
                  placeholder="Add custom allergy (e.g., Mushrooms)..."
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
                <button 
                  onClick={handleAddCustomAllergy}
                  className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t border-slate-800">
              <button 
                onClick={handleSaveDietaryPreferences}
                disabled={isSavingDiet}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-all active:scale-95 cursor-pointer shadow-lg shadow-emerald-950/40"
              >
                {isSavingDiet ? 'Saving...' : 'Save Preferences'}
              </button>
              <button 
                onClick={() => setIsDietModalOpen(false)}
                className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Edit Health Profile Modal --- */}
      {isHealthModalOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => setIsHealthModalOpen(false)}
              className="absolute top-5 right-5 text-gray-400 hover:text-white p-2 rounded-full hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold font-outfit text-white mb-2 flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-400" /> Edit Health Profile Credentials
            </h3>
            <p className="text-xs text-gray-400 mb-6">Update your biometrics, daily goals, and activity level for personalized health metrics.</p>

            {/* Calculated BMI Preview */}
            {(() => {
              const bmiData = calculateBMI(localHealth.height, localHealth.weight);
              return bmiData ? (
                <div className="mb-6 p-4 bg-slate-800/80 border border-slate-700 rounded-2xl flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Calculated BMI</p>
                    <p className="text-xl font-black text-white">{bmiData.bmi}</p>
                  </div>
                  <span className={`text-xs font-black px-3 py-1.5 rounded-full bg-slate-900 border border-slate-700 ${bmiData.color}`}>
                    {bmiData.category}
                  </span>
                </div>
              ) : null;
            })()}

            <div className="space-y-4 mb-6">
              {/* Row 1: Age & Gender */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">Age (Years) <span className="text-red-500">*</span></label>
                  <input 
                    type="number"
                    value={localHealth.age}
                    onChange={e => setLocalHealth({ ...localHealth, age: e.target.value })}
                    placeholder="e.g. 25"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">Gender <span className="text-red-500">*</span></label>
                  <select 
                    value={localHealth.gender}
                    onChange={e => setLocalHealth({ ...localHealth, gender: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">-- Select --</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Height & Weight */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">Height (cm) <span className="text-red-500">*</span></label>
                  <input 
                    type="number"
                    value={localHealth.height}
                    onChange={e => setLocalHealth({ ...localHealth, height: e.target.value })}
                    placeholder="e.g. 175"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">Weight (kg) <span className="text-red-500">*</span></label>
                  <input 
                    type="number"
                    value={localHealth.weight}
                    onChange={e => setLocalHealth({ ...localHealth, weight: e.target.value })}
                    placeholder="e.g. 70"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Activity Level */}
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">Daily Activity Level <span className="text-red-500">*</span></label>
                <select 
                  value={localHealth.activityLevel || 'Moderately Active'}
                  onChange={e => setLocalHealth({ ...localHealth, activityLevel: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="Sedentary">Sedentary (Little or no exercise)</option>
                  <option value="Lightly Active">Lightly Active (1-3 days/week exercise)</option>
                  <option value="Moderately Active">Moderately Active (3-5 days/week exercise)</option>
                  <option value="Very Active">Very Active (6-7 days/week hard exercise)</option>
                  <option value="Super Active">Super Active (Physical job or 2x/day training)</option>
                </select>
              </div>

              {/* Primary Goal */}
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">Primary Health Goal <span className="text-red-500">*</span></label>
                <select 
                  value={localHealth.healthGoal || 'Healthy Lifestyle'}
                  onChange={e => setLocalHealth({ ...localHealth, healthGoal: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="Weight Loss">Weight Loss & Fat Burn</option>
                  <option value="Muscle Gain">Muscle Gain & Hypertrophy</option>
                  <option value="Maintenance">Weight Maintenance</option>
                  <option value="Healthy Lifestyle">Healthy Balanced Lifestyle</option>
                  <option value="Stamina & Endurance">Stamina & Athletic Endurance</option>
                </select>
              </div>

              {/* Row 3: Target Water Intake & Target Weight */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">Daily Target Water (Liters) <span className="text-red-500">*</span></label>
                  <input 
                    type="number"
                    step="0.1"
                    value={localHealth.targetWater || '2.5'}
                    onChange={e => setLocalHealth({ ...localHealth, targetWater: e.target.value })}
                    placeholder="e.g. 2.5"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">Target Weight (kg)</label>
                  <input 
                    type="number"
                    value={localHealth.targetWeight || ''}
                    onChange={e => setLocalHealth({ ...localHealth, targetWeight: e.target.value })}
                    placeholder="Optional"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Row 4: Blood Type & Sleep Duration */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">Blood Type</label>
                  <select 
                    value={localHealth.bloodType || ''}
                    onChange={e => setLocalHealth({ ...localHealth, bloodType: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">-- Optional --</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">Target Sleep (Hours)</label>
                  <input 
                    type="number"
                    step="0.5"
                    value={localHealth.sleepDuration || ''}
                    onChange={e => setLocalHealth({ ...localHealth, sleepDuration: e.target.value })}
                    placeholder="e.g. 8"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Medical Conditions */}
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">Medical Conditions</label>
                <textarea 
                  value={localHealth.medicalConditions || ''}
                  onChange={e => setLocalHealth({ ...localHealth, medicalConditions: e.target.value })}
                  placeholder="Optional: e.g., Asthma, Hypertension, PCOS..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 resize-none h-20"
                ></textarea>
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t border-slate-800">
              <button 
                onClick={handleSaveHealth}
                disabled={isSavingHealth}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-all active:scale-95 cursor-pointer shadow-lg shadow-emerald-950/40"
              >
                {isSavingHealth ? 'Saving Credentials...' : 'Save Health Credentials'}
              </button>
              <button 
                onClick={() => setIsHealthModalOpen(false)}
                className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
