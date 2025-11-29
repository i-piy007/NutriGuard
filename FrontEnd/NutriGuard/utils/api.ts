export type MacroPlanInput = {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: 'male' | 'female';
  goal: 'lose' | 'maintain' | 'gain';
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'very_active' | 'athlete';
  isDiabetic?: boolean;
};

export type MacroPlanResponse = {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  maxSugar: number;
  fiberTarget: number;
  bmr: number;
  tdee: number;
  isDiabetic?: boolean;
};

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://nutriguard-n98n.onrender.com';

export async function getMacroPlan(input: MacroPlanInput): Promise<MacroPlanResponse> {
  const resp = await fetch(`${BASE_URL}/macro-plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(txt || `Macro plan failed: ${resp.status}`);
  }
  return resp.json();
}

// Persisted user targets (subset of MacroPlanResponse) interface
export type UserTargets = {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  maxSugar: number;
  fiberTarget?: number;
};

export async function getUserTargets(token: string): Promise<UserTargets | null> {
  const resp = await fetch(`${BASE_URL}/user/targets`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (resp.status === 404) return null;
  if (!resp.ok) {
    console.warn('[api] getUserTargets failed', resp.status);
    return null;
  }
  return resp.json();
}

export async function saveUserTargets(token: string, targets: UserTargets): Promise<boolean> {
  const resp = await fetch(`${BASE_URL}/user/targets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(targets),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    console.warn('[api] saveUserTargets failed', resp.status, txt);
    return false;
  }
  return true;
}
