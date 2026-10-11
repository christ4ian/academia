# Academia

A standalone, mobile-friendly academic planner for tasks, exams, study schedules, and competitions.

## Try it (Web / PWA)
Open `index.html` in your browser. For installable PWA/offline shell, serve the directory over HTTPS or localhost. The app works offline once loaded, with `localStorage` persistence.

For local development:
```bash
python -m http.server 8080
```
Open `http://localhost:8080/index.html`.

---

## Android Build via GitHub Actions (Capacitor 8)

You do **not** need Android Studio or the Android SDK installed on your computer. A GitHub Actions workflow builds a debug APK automatically in the cloud.

### 1. Push Project to GitHub

If you haven't already connected this project to GitHub:
```bash
git init
git add .
git commit -m "Convert Academia to Capacitor 8 with GitHub Actions"
git branch -M main
git remote add origin https://github.com/<YOUR_USERNAME>/<YOUR_REPOSITORY>.git
git push -u origin main
```

> **Security Note:** Never commit sensitive API keys or credentials. Keys entered in the AI settings modal stay securely in your device's local browser/app storage (`localStorage`) and are never tracked in Git.

### 2. Trigger the Build

You have two ways to trigger the build:

1. **Automatic Build:** Every push to `main` or `master` triggers the build automatically.
2. **Manual Dispatch Trigger:**
   1. Go to your repository on GitHub.
   2. Click the **Actions** tab.
   3. In the left sidebar, click **Build Android Debug APK**.
   4. Click the **Run workflow** dropdown button on the right.
   5. Select the branch (e.g. `main`) and click **Run workflow**.

### 3. Download the APK Artifact

1. Once the workflow run finishes with a green checkmark (usually ~3–5 minutes), click on the run title.
2. Scroll down to the **Artifacts** section at the bottom of the summary page.
3. Click **`academia-debug-apk`** to download the ZIP file containing `app-debug.apk`.
4. Extract the ZIP file to get `app-debug.apk`.

### 4. Install the APK on Your Android Phone

1. **Transfer the APK to your phone:**
   - Transfer via USB cable, Google Drive, WhatsApp, or download it directly from GitHub in your phone's browser (desktop site mode).
2. **Open the APK:**
   - Tap `app-debug.apk` in your phone's Files / Downloads app.
3. **Allow Installation from Unknown Sources:**
   - If prompted by Android (*"For your security, your phone is not allowed to install unknown apps from this source"*), tap **Settings**.
   - Toggle **Allow from this source** ON.
4. **Complete Installation:**
   - Tap **Install**. Once installed, tap **Open** to launch Academia as a native Android app!

---

## Features
- **Home**: Quick Add bar, high-priority tasks, and upcoming agenda.
- **Tasks**: Checklists, subtasks, subjects, deadlines, edit/delete/search.
- **Calendar**: Month, agenda, and study blocks with type filters.
- **Competitions**: Multi-stage progress tracking with timeline display.
- **Study Planning**: Time intervals, recurrence, and session blocks.
- **Local Persistence**: `localStorage` backup & restore via JSON.
