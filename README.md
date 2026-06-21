# National Identity Card Management Hub & QR Routing Gateway

A production-grade, full-stack application built with **HTML/JavaScript**, **Node.js Serverless Functions**, and **MongoDB** designed to manage, verify, and route citizen national identity cards. It includes a beautiful administration dashboard and a serverless backend proxy to communicate with third-party government services without CORS restrictions.

---

## Key Features

1. **Identity Studio & Form Design**:
   - Auto-hyphen formatting for NIN/NID numbers (`XXX-XXX-XXX-X`).
   - Dynamic transliteration of NIN digits from English to Nepali in real-time.
   - Bidirectional AD-to-BS and BS-to-AD Date of Birth conversion.
   - Dynamic administrative address generation (District, Municipality, Type, and Ward selectors).
   
2. **Interactive Database Ledger**:
   - **Custom Column Visibility**: Show/hide any database column dynamically (NID, Name, Token, DOB, Address, Dates, Status, etc.).
   - **Click-to-Copy Tokens**: Truncated secure tokens copy instantly to your clipboard when clicked.
   - **Server-Side Dynamic Sorting**: Click headers to sort by NID, Name, Dates, or Status (defaults to showing the newest entry at the top).
   - **Inline Status Updates**: Change card execution status (Pending, Done, In Progress, Not Online) directly from the table.

3. **QR Routing Verification Gateway (`/verify/:ninEn`)**:
   - Generates unique QR codes for each record that point to `/verify/<NIN>`.
   - If a **Secure Token** is configured in the database, the gateway does a `302 Redirect` to the official verification portal: `https://nin-support-api.donidcr.gov.np/api/v1/enid/verify?token=<TOKEN>`.
   - If **no token** is found, the server renders a premium glassmorphic dark-theme profile card informing the user: *"Your NID number token is not configured or not online"* alongside their registered details.

4. **Government Download Gateway Proxy (`/api/download`)**:
   - Instantly pre-fills details from the database using the new **Search & Populate** feature in the Download Card Portal tab.
   - Proxies downloading requests directly from the server to bypass CORS issues, using low-level connection pooling and decompression (`zlib` for Brotli/gzip) to avoid timeouts.

5. **IP Access Security Whitelisting**:
   - Blocks dashboard access (Form, Download Portal, Database Ledger) if the client's public/local IP address is not whitelisted.
   - An **Admin Setup** tab handles unlocking the whitelisting console using password authorization (default: `Ss9805344374@><`).
   - Allows dynamically whitelisting/removing permitted IP addresses.
   - Whitelist lookup is done dynamically by resolving the client computer's IP address directly.

---

## Project Structure

```
├── api/
│   ├── db.js             # Reusable MongoDB Mongoose connector (cached)
│   ├── download.js       # Outbound HTTPS gateway proxy for citizen PDFs
│   ├── people.js         # RESTful CRUD backend for database ledger
│   ├── verify.js         # QR routing verification gateway (redirect / HTML card)
│   └── models/
│       └── Person.js     # Mongoose database model (unique ninEn index)
├── .env                  # Local environment configuration secrets
├── index.html            # Premium dashboard interface
├── package.json          # Dependency and script manager
└── vercel.json           # URL routing rewrite mapping
```

---

## Configuration & Environment Variables

Configure your database connection inside a `.env` file at the root of the project:

```env
MONGODB_URI=mongodb+srv://sujalmehta:admin123@cluster0.u8czprf.mongodb.net/qrcode?retryWrites=true&w=majority
```

---

## Quick Start & Running Locally

### 1. Install Dependencies
Ensure you have Node.js (version 18+) installed. Run the command to install packages:
```bash
npm install
```

### 2. Install Vercel CLI (Globally)
If you haven't installed Vercel's developer tools globally:
```bash
npm i -g vercel
```

### 3. Run Development Server
Start the local Vercel dev server:
```bash
npx vercel dev
```
Open **`http://localhost:3000`** in your browser.

---

## Deploying to Vercel (Production)

To host your project in production on Vercel:

1. **Deploy via CLI**:
   Run `vercel` in the project directory:
   ```bash
   vercel
   ```
2. **Configure Database Secrets**:
   Go to your project settings in the Vercel Dashboard under **Environment Variables**, and add:
   - Key: `MONGODB_URI`
   - Value: `mongodb+srv://sujalmehta:admin123@cluster0.u8czprf.mongodb.net/qrcode?retryWrites=true&w=majority`
3. **Promote to Production**:
   ```bash
   vercel --prod
   ```

---

## Verification & Manual Testing

1. **Card Setup**:
   - Go to the **Form Design Studio** tab.
   - Fill in a citizen's profile.
   - Select a District/Municipality/Type/Ward to auto-generate the permanent addresses in the standard format (`Inaruwa Municipality-2, Sunsari`).
   - Leave the "Secure Token" field blank if you want to test the profile preview page, or paste a token to test the redirection.
   - Submit the record.

2. **Verifying Database**:
   - Go to the **Database Index Table** tab.
   - Click the column toggles to show/hide columns.
   - Click on the headers (e.g. NID Number, Name, Dates) to sort the rows.
   - Click on any token to copy it instantly.

3. **Verifying QR Routing**:
   - Scan the QR code or navigate to: `http://localhost:3000/verify/<NIN_NUMBER>` (e.g. `http://localhost:3000/verify/615-385-908-6`).
   - If a token is saved, it redirects. If not, it presents the premium detail status card.

4. **Verifying PDF Download**:
   - Go to the **Download Card Portal** tab.
   - Use the **Search & Populate** bar to search by name/NIN to autofill the form.
   - Click **Download PDF** to verify the PDF fetches successfully.
