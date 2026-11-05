# EduTrack

EduTrack is a simple teacher tool for recording student accommodation use, test scores, and progress on selected TEKS.

## Privacy setup

- **Supabase:** teacher sign-in and teacher display name only.
- **This browser:** student names, grades, accommodation plans, daily/test check-ins, notes, TEKS lists, and assessment scores.
- **Backups:** teachers download a private JSON backup from Settings and restore it on another device. A student report can be printed or saved as PDF, and student records can be downloaded as CSV.

This means classroom records do not sync between devices or browsers. If browser site data is cleared, those records are removed unless you have a backup. Treat downloaded backups and reports as confidential student records and follow your school’s rules for storing and sharing them.

Browser storage is not an encrypted school database. Use an individual, password-protected device/browser profile and get your school’s approval before entering identifiable student information.

## Files in the repository

- `index.html` — app page
- `styles.css` — layout and print-friendly reports
- `app.js` — sign-in, local classroom data, check-ins, scores, and reports
- `supabase-config.js` — your new project URL and publishable key; these are browser-visible values, not passwords
- `supabase/schema.sql` — creates the teacher profile table and teacher-only policies
- `.github/workflows/pages.yml` — deploys the site to GitHub Pages

## Start with a brand-new Supabase project

1. Create a new Supabase project.
2. Open its **SQL Editor**, paste in the complete `supabase/schema.sql` file, and run it once. It creates only `public.teacher_profiles`; it does not create any student, accommodation, or score tables.
3. In **Project Settings → API**, copy the Project URL and **publishable** key. Never use a secret or service-role key in the website.
4. Edit `supabase-config.js` in this folder. Replace the example URL and key with the new project details. The publishable key is designed to be visible in a website; never paste a secret/service-role key.
5. In **Authentication → URL Configuration**, set the Site URL to your future GitHub Pages address and add that address to the Redirect URLs list. For a repository named `EduTrack`, the address is usually `https://YOUR-GITHUB-NAME.github.io/EduTrack/`.
6. Decide whether teacher email confirmation is on in Supabase **Authentication → Providers → Email**. If it is on, a teacher must confirm the message before signing in.

## Create a new GitHub repository and deploy

1. Create a new repository named `EduTrack` (or another name you choose). Make sure your GitHub plan allows Pages for the repository visibility you choose. Student information is not stored in GitHub; do not put student records or backup files in the repository.
2. Upload the **contents** of this `edutrack-fresh` folder to the top level of the repository. Include the `.github` folder and the `supabase` folder. Also include your newly created `supabase-config.js`.
3. Open repository **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.
4. Open **Actions** and wait for **Deploy EduTrack to GitHub Pages** to finish. The live site address appears in the Pages settings.
5. Add the live address to Supabase’s allowed Redirect URLs. Reload the site, create a teacher account, then sign in.

The included workflow cancels an older in-progress Pages deployment when a newer commit arrives, which avoids stacking many deploys in the queue.

## Using the app

- Add a student and select their accommodations with checkboxes. The built-in list includes Hard copy notes; oral responses is not included. Add a custom accommodation when needed.
- Select a student and choose **Record today**. For each listed accommodation, click **Used** or **Not used** and save the date and activity type (Daily, Test, or Other).
- Add frequently used TEKS under **Settings**. Mark priority standards so they stand out in growth reports. Scores are entered a student at a time using a simple form; CSV import is not required.
- Use **Reports** for a TEKS growth summary, or open a student and choose **Print report** or **Download CSV**. The report is formatted to use less paper.
- Use **Settings → Download backup** regularly. Restore a backup in Settings on the browser/device where you want to continue working.
- Deleting a student also deletes that student’s check-ins and scores from this browser. The app asks you to confirm first.

## Scope

This fresh version supports individual teachers. Administrator dashboards and roster assignment are not included yet. Because student records are local to a browser, this is not a shared roster or a school records system.
