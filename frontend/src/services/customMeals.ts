import { API_BASE } from "../config";
import { CustomMealCreateRequest, CustomMealResponse } from "../types/customMeal";

export async function createCustomMeal(
  token: string,
  data: CustomMealCreateRequest
): Promise<CustomMealResponse> {
  const response = await fetch(`${API_BASE}/api/meals/custom`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    let errorDetail = "Failed to create recipe.";
    try {
      const errJson = await response.json();
      errorDetail = errJson.detail || errJson.message || errorDetail;
    } catch {
      // fallback to status text
      errorDetail = response.statusText || errorDetail;
    }
    throw new Error(errorDetail);
  }

  return response.json();
}

export async function getUserCustomMeals(token: string): Promise<CustomMealResponse[]> {
  const response = await fetch(`${API_BASE}/api/meals/custom`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch custom recipes.");
  }

  return response.json();
}

export async function deleteCustomMeal(token: string, mealId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/meals/custom/${mealId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to delete recipe.");
  }
}
