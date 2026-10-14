# Recipes Vault

Private recipe collection for one owner. Google sign-in protects the app, Firestore rules restrict database access to the owner's verified Google account, and recipes and pantry ingredients sync across devices.

## Stack

- React, TypeScript, Vite, and Firebase modular SDK.
- Firebase Authentication with Google sign-in.
- Cloud Firestore for recipes and pantry items.
- Firestore security rules in `firestore.rules`; access is denied until the owner UID is configured.
- Vercel static hosting and a serverless recipe-import endpoint.
- Workbox PWA with the install manifest in `frontend/public/manifest.webmanifest`; PNG icons include 192px, 512px, maskable Android, and 180px Apple touch sizes.

## 1. Create the Firebase project

1. In [Firebase Console](https://console.firebase.google.com/), create a project.
2. Add a Web app in Project settings and keep the Firebase configuration values available.
3. Under **Authentication → Sign-in method**, enable **Google**.
4. Under **Authentication → Settings → Authorized domains**, add `localhost` for local development. Add the Vercel production domain and any preview domain you use after deployment.
5. Under **Firestore Database**, create a database. The location cannot be changed later; choose one close to you.
6. Do not publish permissive Firestore rules from the Firebase Console. This repository supplies owner-only rules.

The Firebase web configuration is public by design. Do not put service-account keys or other private credentials in the frontend or in `VITE_*` variables.

## 2. Set up local configuration and find the owner UID

In PowerShell, from the repository root:

```powershell
Copy-Item frontend/.env.example frontend/.env.local
```

Fill `frontend/.env.local` with the Web app values:

```dotenv
VITE_FIREBASE_API_KEY=your-web-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_APP_ID=your-web-app-id
VITE_OWNER_EMAIL=you@example.com
VITE_OWNER_UID=
```

Start the app and sign in with the verified Google account you want to authorize:

```powershell
cd frontend
npm ci
npm run dev
```

When `VITE_OWNER_UID` is blank, the setup screen displays the signed-in account's UID but does not show the recipe app or allow database access. Copy that UID for the next step.

## 3. Lock Firestore to your account

1. In `firestore.rules`, replace `REPLACE_WITH_OWNER_UID` with your Firebase Authentication UID.
2. Set `VITE_OWNER_UID` to that same UID in `frontend/.env.local`.
3. Install the Firebase CLI if needed, then sign in and deploy only the checked-in rules:

```powershell
npm install --global firebase-tools
firebase login
firebase deploy --only firestore:rules --project your-project-id
```

The rules allow only that verified UID to read, create, update, or delete documents in `users/{uid}/recipes` and `users/{uid}/pantry`. All other Firestore access is denied. The UID check in the browser is only a usability gate; the deployed Firestore rules provide the actual database security.

Restart the Vite server after changing `.env.local`. Confirm that you can sign in, add a recipe and a pantry item, then reload the app to verify they persist. Do not deploy before replacing the UID placeholder and deploying the rules.

## 4. Deploy to Vercel

1. Push this repository to your Git provider and import it in Vercel.
2. Keep the repository root as the Vercel **Root Directory**. The checked-in `vercel.json` configures installation, build, output, SPA routing, and the `/api/import-recipe` function.
3. In **Project Settings → Environment Variables**, add each variable below for **Production** and **Preview** (and Development if you use Vercel's local development):
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_APP_ID`
   - `VITE_OWNER_EMAIL`
   - `VITE_OWNER_UID`
4. Save the variables and redeploy so Vite embeds the new configuration in the frontend.
5. Add the deployed Vercel hostname to Firebase Authentication's authorized domains. If you use a custom domain, add that too.
6. Open the deployed site and test Google sign-in, recipe and pantry changes, reload, and access from a second device.

Vercel runs `npm --prefix frontend ci --include=dev` and `npm --prefix frontend run build`. The output is `frontend/dist`; recipe import remains available at `/api/import-recipe`.

## Recipe discovery and barcode lookup

## App language and catalog data

Choose English (US) or Português (Brasil) in the sidebar. The selection changes app interface labels only; it does not translate saved recipe content or external catalog data. TheMealDB source recipe content is English only. Open Food Facts product fields remain in the language entered by contributors and can vary by product.

### TheMealDB

The app uses TheMealDB's ingredient-filter (`filter.php`) and recipe-lookup (`lookup.php`) endpoints. The current Vercel app configuration requires the server-only `MEALDB_API_KEY` environment variable to be set; when running locally outside Vercel, it falls back to the public development key `1`. This is an application configuration requirement, not a claim that these endpoints require a paid or newly generated key.

Set `MEALDB_API_KEY` in Vercel (Production and Preview) and redeploy; `/api/mealdb` reads it server-side and never exposes it in the frontend. The app disables catalog requests on Vercel when it is missing. Confirm TheMealDB's current terms and licensing for your production use before deployment. The Discover page searches the catalog using one ingredient, opens ingredients and method, and credits TheMealDB and the original recipe source. TheMealDB's ingredient data can differ from the linked publisher page in quantities, alternatives, optional ingredients, and grouping; treat that page as authoritative. The app warns users to check the source and supports importing recipe pages with Schema.org recipe data for review before saving.

### Open Food Facts

The Scan food page supports camera scanning over HTTPS and manual entry of EAN/UPC. Product lookup is proxied through `/api/open-food-facts`, sends a Recipes Vault `User-Agent`, validates the barcode check digit, and limits the upstream response to requested fields. Open Food Facts reads require no API key. An unknown barcode, unavailable catalog, rate limit, missing nutrition fields, or camera error is shown explicitly.

Product details link to their Open Food Facts source and identify the database/content licenses. The displayed per-100g or per-100ml low/medium/high indicators follow the UK 2016 front-of-pack guidance for packaged foods; energy is shown as a value without a traffic-light rating. Protein/fiber "source/high" labels follow the applicable EU nutrition-claim criteria and require adequate energy/nutrient data. These indicators are not an overall health score. Additives are shown as data only and do not imply harm. Nutrient and ingredient data are community-contributed, may be incomplete/inaccurate, and are not for medical use. Verify the physical package and seek qualified advice for health decisions.

## Local development and checks

Requirements: Node.js 22.12+.

```powershell
cd frontend
npm ci
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
```

Never commit `frontend/.env.local`. The committed `frontend/.env.example` contains placeholders only.

## Recipe backups

Use **Export backup** regularly from the sidebar to download a JSON copy of your recipes. **Restore backup** in the sidebar validates the file and asks for confirmation before replacing the cloud recipe collection; pantry items are not changed. Keep backups in a secure location.

If the app finds recipes from the earlier device-only version in this browser, it offers an explicit import into the cloud collection after sign-in. Existing cloud recipes are never overwritten by that migration prompt.

## Recipe import

Recipe URLs are read server-side by the Vercel function. The importer accepts supported Schema.org recipe data, applies SSRF protections, and requires review before saving. Some websites block automated requests or omit recipe metadata; manual entry remains available.
