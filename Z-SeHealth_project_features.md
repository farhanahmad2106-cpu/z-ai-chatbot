# Z-SeHealth Project Features

This document outlines the features currently implemented in the Z-SeHealth application, as well as exciting ideas for future development.

## Core Features (Previously Built)
* **Authentication & Authorization:** Secure user login and registration system.
* **Dashboard UI:** A sleek, modern dashboard displaying daily health statistics and recent logs.
* **Food Scanning & AI Analysis:** Upload photos of food/ingredients to be analyzed by advanced AI vision models (Ollama & NVIDIA) to identify the item.
* **Text & Manual Search:** Ability to manually search for foods if a photo isn't available or if the AI needs a hint.
* **Ingredient Translation:** Automatic translation of food items and ingredients to the user's preferred language using AI.
* **Macro Estimation:** Intelligent estimation of calories, protein, carbs, and fats based on the scanned or searched food.
* **Meal Logging:** Save analyzed foods directly to the user's daily meal log.

## Features Built Today
* **Enterprise Admin Operations & Telemetry Hub:** Full-stack administrative operations suite built directly into the React 19 + Vite frontend (`/admin`) and FastAPI backend.
  * **RBAC & Security Clearance Layer:** Master Super Admin (`Farhan Ahmad`) with exclusive roster governance; granular capability flags for moderators (`canManageUsers`, `canApproveFoods`, `canTriggerOTA`, `canViewRevenue`, `canViewLogs`).
  * **Brutalist Admin Route Guard:** `AdminRouteGuard.tsx` rejects non-admin callers with a 403 Forbidden terminal protocol view.
  * **Crowdsourced Food Safety Moderation:** Side-by-side review of raw OCR inputs against parsed INS additives, allergens, and safety scores; single-click approval commits items to the global SWR searchable food index (`is_verified: true`).
  * **User Governance & Quota Reset Engine:** Searchable, paginated user table with tier pill badges, 20-scan quota usage progress bars, instant quota resets back to 0, and account suspension / ban toggles with audit reason notes.
  * **Super Admin Team Management:** Exclusive tab for Farhan Ahmad to invite moderators via email, configure granular permission capabilities, view last login timestamps, and revoke access.
  * **Real-time System Telemetry & Logs:** Monospace exception stream querying MongoDB `system_logs` with level filters (`CRASH`/`ERROR`, `FAILOVER`/`WARNING`, `INFO`), grep search, and structured JSON trace modal.
  * **EAS Mobile OTA Hotfix Controller:** Channel switcher (production/staging), live release inspector, and instant OTA remote hotfix trigger via GitHub Actions repository dispatches.
  * **Platform KPIs & Revenue Analytics:** Live overview cards tracking Total Users, Active Users Today, Scans Executed, Moderation Queue, Tier Breakdown, and Estimated MRR (₹366/₹732/₹998).
  * **Next.js Boilerplate Deprecation:** Safely cleaned up and removed `admin-dashboard/` to maintain a lean, single-page React app.

## Future Feature Ideas (Coming Next)
* **Smart Meal Planning:** Generate weekly meal plans and automated grocery lists based on the foods you frequently scan.
* **Dietary Restriction Filters:** Automatically flag scanned ingredients if they conflict with user-set diets (e.g., Keto, Vegan, Gluten-Free, Halal).
* **Advanced Analytics & Charts:** Visual graphs showing macro trends over weeks or months to better track progress.
* **Wearable Integration:** Sync calorie and macro data with Google Fit or Apple Health.
* **Barcode Scanner Mode:** In addition to AI image recognition, add a traditional barcode scanner for packaged foods using an open food database.
* **Community Challenges:** Social features allowing users to share their healthy meals or participate in health challenges together.
