# Academia v2.0

A mobile-friendly academic planner for tasks, personal study agendas, daily schedules (00:00–24:00), notes, and competitions — powered by Firebase Authentication & Firestore cloud sync, plus Google Gemini & OpenRouter AI Quick Add.

## Local Development (Web / PWA)
Build the bundle and serve locally:
```bash
npm install
npm run build
npm test
python -m http.server 8080
```
Open `http://localhost:8080/index.html`.

---

## Key Features in v2.0
- **Visible Notes Everywhere**: Dedicated **Notes** tab (pin to Home, color-coded cards, subject filters), inline 2-line note previews on every task, agenda, and competition card, plus optional note attachment on tasks/events.
- **OpenRouter + Gemini AI Quick Add**: Choose between Google Gemini and OpenRouter (13 curated `:free` models built-in, default `nvidia/nemotron-3-ultra-550b-a55b:free`, live refresh from OpenRouter API, and custom model ID input).
- **Personal Agenda (`Agenda Pribadi`)**: Dedicated segment in Tasks for self-paced study goals (e.g., summarizing chapters) without mandatory deadlines, complete with checklists.
- **Customizable Calendar Types & GCal-Style Month View**: Built-in types (`Libur`, `Ulangan`, `Tugas`, `Belajar`, `Agenda pribadi`, `Acara sekolah`, `Ekskul`, `Pengingat`, `Lomba`) with customizable labels, 8-color palette, visibility toggles, custom user-defined types, holiday cell highlights, and compact GCal-style chips.
- **24-Hour Daily View (`00:00–24:00`) & "Rencana Hari"**: Interactive 00:00–24:00 hourly grid with live red current-time line, tap-to-schedule slots, and a batch **"Atur hari ini"** planner (quick rows, multiline text parser, one-tap import from active tasks, and overlap detection).
- **Integrated Competitions**: Competitions appear directly on the Calendar and in the conditional **Lomba Aktif** card on Home with accurate upcoming stage countdowns (`H-N`) and missed-stage indicators.
- **Firebase Auth & Real-Time Firestore Sync**: Sign in with Google (Web popup & native Capacitor Android) or Email/Password, with offline persistence and per-item last-write-wins sync under `users/{uid}/{tasks|activities|notes|competitions}/{id}`.

---

## Firebase & Android Build Setup (Capacitor 8 + GitHub Actions)

1. **Firebase Console**:
   - Enable **Google** and **Email/Password** in **Authentication → Sign-in method**.
   - Create a **Firestore Database** and deploy the security rules in [`firestore.rules`](firestore.rules).
   - Register Android app `com.academia.app`, add your keystore's SHA-1 fingerprint, and download `google-services.json`.

2. **GitHub Actions Secrets** (`Settings → Secrets and variables → Actions`):
   - `KEYSTORE_B64`: Base64-encoded fixed `.jks` keystore file
   - `KEYSTORE_PASSWORD`: Keystore password
   - `KEY_ALIAS`: Key alias (`academia`)
   - `KEY_PASSWORD`: Key password
   - `GOOGLE_SERVICES_JSON_B64`: Base64-encoded `google-services.json`

3. **Trigger APK Build**:
   - Push to `main` or run the **Build Academia APK** workflow manually from the **Actions** tab, then download **`Academia-Android-APK`**.
