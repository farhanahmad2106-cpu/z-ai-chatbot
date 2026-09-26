export type Gender = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type HealthGoal = "weight_loss" | "maintenance" | "muscle_gain";

export interface PhysicalMetrics {
  age: number;
  gender: Gender;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  healthGoal: HealthGoal;
}

export interface MacroTargets {
  bmr: number;
  tdee: number;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
}

export interface MacroPercentages {
  protein: number;
  carbs: number;
  fat: number;
}

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const MACRO_DISTRIBUTIONS: Record<HealthGoal, MacroPercentages> = {
  weight_loss: { protein: 0.35, carbs: 0.35, fat: 0.30 },
  maintenance: { protein: 0.25, carbs: 0.50, fat: 0.25 },
  muscle_gain: { protein: 0.30, carbs: 0.50, fat: 0.20 },
};

export function calculateMacros(metrics: PhysicalMetrics): MacroTargets {
  const { age, gender, heightCm, weightKg, activityLevel, healthGoal } = metrics;

  // Validation
  if (
    Number.isNaN(age) ||
    Number.isNaN(heightCm) ||
    Number.isNaN(weightKg) ||
    !Number.isFinite(age) ||
    !Number.isFinite(heightCm) ||
    !Number.isFinite(weightKg)
  ) {
    throw new Error("Invalid physical metrics: values must be finite numbers");
  }

  if (age < 18 || age > 120) {
    throw new Error("Invalid age: must be between 18 and 120");
  }

  if (heightCm <= 0 || weightKg <= 0) {
    throw new Error("Invalid height or weight: must be positive");
  }

  if (!ACTIVITY_MULTIPLIERS[activityLevel]) {
    throw new Error(`Unsupported activity level: ${activityLevel}`);
  }

  if (!MACRO_DISTRIBUTIONS[healthGoal]) {
    throw new Error(`Unsupported health goal: ${healthGoal}`);
  }

  if (gender !== "male" && gender !== "female") {
    throw new Error(`Unsupported gender: ${gender}`);
  }

  // Mifflin-St Jeor BMR
  let bmr = 10 * weightKg + 6.25 * heightCm - 5 * age;
  if (gender === "male") {
    bmr += 5;
  } else {
    bmr -= 161;
  }

  // TDEE
  const tdee = bmr * ACTIVITY_MULTIPLIERS[activityLevel];

  // Goal Calorie Adjustment
  let calories = tdee;
  if (healthGoal === "weight_loss") {
    calories = Math.max(1200, tdee - 500);
  } else if (healthGoal === "muscle_gain") {
    calories = tdee + 350;
  }

  // Macro Distribution
  const distro = MACRO_DISTRIBUTIONS[healthGoal];
  const proteinCals = calories * distro.protein;
  const carbsCals = calories * distro.carbs;
  const fatCals = calories * distro.fat;

  // Gram Calculations
  const proteinGrams = proteinCals / 4;
  const carbsGrams = carbsCals / 4;
  const fatGrams = fatCals / 9;

  return {
    bmr,
    tdee,
    calories,
    proteinGrams,
    carbsGrams,
    fatGrams,
  };
}

export function roundMacroTargets(targets: MacroTargets): MacroTargets {
  return {
    bmr: Math.round(targets.bmr),
    tdee: Math.round(targets.tdee),
    calories: Math.round(targets.calories),
    proteinGrams: Math.round(targets.proteinGrams),
    carbsGrams: Math.round(targets.carbsGrams),
    fatGrams: Math.round(targets.fatGrams),
  };
}

export function mapProfileToMetrics(profile: Record<string, unknown> | null | undefined): PhysicalMetrics | null {
  if (!profile) return null;

  const age = Number(profile.age);
  const heightCm = Number(profile.height);
  const weightKg = Number(profile.weight);

  if (!age || !heightCm || !weightKg || age <= 0 || heightCm <= 0 || weightKg <= 0) return null;

  let gender: Gender;
  if (profile?.gender) {
    const g = profile.gender.toString().toLowerCase();
    if (g === "male" || g === "m") gender = "male";
    else if (g === "female" || g === "f") gender = "female";
    else return null;
  } else {
    return null;
  }

  let activityLevel: ActivityLevel;
  if (profile?.activityLevel) {
    const act = profile.activityLevel.toString().toLowerCase().trim();
    if (act.includes("sedentary") || act.includes("not active")) activityLevel = "sedentary";
    else if (act.includes("light")) activityLevel = "light";
    else if (act.includes("moderate")) activityLevel = "moderate";
    else if (act.includes("very")) activityLevel = "very_active";
    else if (act.includes("active")) activityLevel = "active";
    else return null;
  } else {
    return null;
  }

  let healthGoal: HealthGoal;
  if (profile?.healthGoal) {
    const goal = profile.healthGoal.toString().toLowerCase().trim();
    if (goal.includes("loss") || goal.includes("lose")) healthGoal = "weight_loss";
    else if (goal.includes("gain") || goal.includes("build") || goal.includes("muscle")) healthGoal = "muscle_gain";
    else if (goal.includes("maintenance") || goal.includes("maintain") || goal.includes("healthy")) healthGoal = "maintenance";
    else return null;
  } else {
    return null;
  }

  return {
    age,
    gender,
    heightCm,
    weightKg,
    activityLevel,
    healthGoal,
  };
}
