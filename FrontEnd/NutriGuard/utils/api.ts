export type MacroPlanInput = {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: 'male' | 'female';
  goal: 'lose' | 'maintain' | 'gain';
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'very_active' | 'athlete';
};

export type MacroPlanResponse = {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  maxSugar: number;
  bmr: number;
  tdee: number;
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
