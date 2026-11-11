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
- Add class periods in the **Classes** tab. Choose **Add existing** to select students already in your roster (this moves them from their current class, if assigned), or **New student** to create a student directly in that class. You can also change a class assignment when editing a student. Use **View students** or the class filter on the Students page to open a smaller roster.
- Select a student and choose **Record today**. Check only the accommodations used, then save the date and activity type (Daily, Test, or Other). Unchecked accommodations are recorded as not used.
- Add frequently used TEKS under **Set Standards** if you want to monitor them. When recording a test, the only required field is the overall test score. Test name, date, and points possible are optional. Choose **Add TEKS scores** to enter a breakdown by individual standard; TEKS tracking can be skipped completely.
- **Import a roster:** on **Students**, choose **Import roster** and download the CSV template. Add one student per row. Use `class_name` to assign or create a class period; `eb`, `sped`, and `504` accept Yes or No; separate multiple accommodations with semicolons. Review the preview and fix any duplicate names before importing.
- **Import test data:** on **Reports**, choose **Import test data** and download its CSV template. Include one row per overall test result; for a TEKS breakdown, repeat the student, test name, date, and overall score on each TEKS row. Leave the TEKS columns blank when you only have an overall score. The student's name must match the roster. Dates can be `YYYY-MM-DD` or `M/D/YYYY`. The preview checks the rows before anything is saved.
- Both imports are processed in the browser. Student names and scores stay in this browser and are not uploaded to Supabase. CSV files are not a backup; use the private JSON backup for a complete copy of classroom records.
- Set each student's grade from Kindergarten through Grade 12 and record EB, SpEd, and 504 status in the student form. These fields are included in student reports.
- When logging accommodation use, check only the accommodations used; unselected accommodations are recorded as not used. The test score form can also record accommodations used on that test in the same save.
- TEKS reports show a school-year average for August 1 through July 31. Each student's average is calculated across their recorded test percentages, then student averages are averaged equally for the class view. The student profile shows that student's current-year average and latest score.
- Use **Reports** for a TEKS growth summary, or open a student and choose **Print report** or **Download CSV**. The report is formatted to use less paper.
- Use **Settings → Download backup** regularly. Restore a backup in Settings on the browser/device where you want to continue working.
- At the end of the year, **Settings → Clear student records** removes student profiles, accommodations, check-ins, and test scores from this browser. It keeps class periods and monitored TEKS. The app asks you to type `CLEAR` and offers a backup download first.
- Deleting a student also deletes that student’s check-ins and scores from this browser. The app asks you to confirm first.

## Scope

This fresh version supports individual teachers. Administrator dashboards and roster assignment are not included yet. Because student records are local to a browser, this is not a shared roster or a school records system.
