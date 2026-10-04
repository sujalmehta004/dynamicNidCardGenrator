# National Identity Card Management Hub & QR Routing Gateway

A secure, modern, full-stack web platform for managing citizen identity records, generating QR-based verification routes, and handling official identity-card download workflows through a serverless backend.

This project combines a polished administrative dashboard with Node.js serverless functions and MongoDB to support identity data entry, verification, routing, and secure government-service integrations.

---

## What This Project Does

The application is designed to help an authorized operator manage identity-related records in a structured way. It allows users to:

- Create citizen identity records with formatted NID/NIN details.
- Generate QR-based routing links for verification.
- Redirect users to third-party verification portals when a secure token is available.
- Display rich profile cards when verification is unavailable or token data is missing.
- Search and populate official download forms automatically.
- Control who can access the dashboard through IP allowlisting.

In short, it acts as a central workspace for identity record handling, verification routing, and secure document access.

---

## Main Features

### 1. Identity Form Studio
- Auto-format NID/NIN values in a readable pattern.
- Support transliteration and real-time input formatting.
- Convert dates between AD and BS formats.
- Generate permanent addresses dynamically based on district, municipality, type, and ward selection.
- Store secure tokens and related identity information.

### 2. Database Ledger and Record Management
- View saved citizen records in a dynamic table.
- Show or hide columns based on the operator’s needs.
- Sort records by important fields such as name, date, or status.
- Update status values directly from the table.
- Copy secure tokens with a single click.

### 3. QR Verification Routing
- Generate unique QR links for each record.
- Route visitors to an official verification endpoint when a secure token is present.
- Show a polished fallback profile card when verification data is unavailable.
- Support a public verification flow through the /verify/:nin route.

### 4. Government Download Gateway
- Search for existing citizen records from the dashboard.
- Populate official download forms automatically.
- Proxy PDF/document download requests from the backend to avoid browser CORS issues.
- Improve reliability for document retrieval through server-side request handling.

### 5. Access Control and Security
- Restrict dashboard access using IP allowlisting.
- Provide administrator setup controls for managing allowed devices.
- Protect sensitive operations with server-side validation and backend routes.

### 6. Third-Party Verification Integration
- Request and verify OTP flows.
- Work with captcha-based verification steps.
- Support voter-search and government portal interactions through serverless API endpoints.

---

## Tech Stack

- Frontend: HTML, CSS, JavaScript, Tailwind CSS
- Backend: Node.js serverless functions on Vercel
- Database: MongoDB with Mongoose
- Utilities: QR generation, PDF handling, and date conversion libraries
- Deployment: Vercel

---

## Project Structure

```text
api/
  allowed-ips.js
  captcha.js
  check-token.js
  config.js
  download.js
  hostname.js
  people.js
  request-otp.js
  save-voter-list-record.js
  verify-otp.js
  verify.js
  voter-search.js
lib/
  db.js
  models/
    AllowedComputer.js
    AllowedIp.js
    Config.js
    Person.js
    VoterListRecord.js
index.html
package.json
README.md
vercel.json
```

---

## Installation

### Prerequisites
- Node.js 18 or newer
- npm
- A MongoDB connection string
- A Vercel account for deployment

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Environment Variables

Create a `.env` file in the project root (you can also copy `.env.example`):

```bash
cp .env.example .env
```

Configure the following required environment variables:

```env
# Primary MongoDB Database (Required)
# Used for storing citizen identity profiles, allowed IPs, allowed devices, and system configs.
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-url>/<database-name>?retryWrites=true&w=majority

# Secondary MongoDB Database (Required for Voter List Storage)
# Dedicated database used for caching and persisting election voterlist records, portraits, and statuses.
MONGODB_URI_SECOND=mongodb+srv://<username>:<password>@<secondary-cluster-url>/<database-name>?retryWrites=true&w=majority
```

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | **Yes** | Primary database connection string for citizen identity records (`Person`), IP allowlist (`AllowedIp`), approved computers (`AllowedComputer`), and system settings (`Config`). |
| `MONGODB_URI_SECOND` | **Yes** | Secondary database connection string dedicated to saving and retrieving election portal voter list records and base64 portraits (`VoterListRecord`). |

---

### 3. Keyboard Shortcuts

Work faster with built-in global shortcuts accessible from any tab or modal:

| Shortcut (Mac) | Shortcut (Windows/Linux) | Action |
|---|---|---|
| `Cmd + K` | `Ctrl + K` | Switch to **Form Design Studio** (new entry / editor) |
| `Cmd + S` | `Ctrl + S` | Switch to **Download Card Portal** (search & PDF download) |
| `Cmd + F` | `Ctrl + F` | Switch to **Database Index Table** & toggle Full Screen |
| `Escape` | `Escape` | Exit Full Screen view |

---

### 4. Run Locally

```bash
npx vercel dev
```

Then open:

```text
http://localhost:3000
```

---

## Typical Workflow

1. Open the dashboard and go to the Form Design Studio (`Cmd+K` / `Ctrl+K`).
2. Enter the citizen’s information and save the record.
3. Review the record in the Database Index Table (`Cmd+F` / `Ctrl+F`).
4. View official voter list records, portraits, and details directly in the modal popup.
5. Generate or share the QR verification link.
6. Use the verification route to redirect or display citizen information.
7. Use the Download Card Portal (`Cmd+S` / `Ctrl+S`) to search and fetch the document or download paper formats (Standard Portrait, Landscape with White Card, or Phone Verified).

---

## API Routes

The backend exposes several serverless API endpoints, including:

- `/api/captcha` — Captcha generation and verification proxy
- `/api/request-otp` — Request OTP verification
- `/api/verify-otp` — Verify OTP and fetch official document tokens
- `/api/check-token` — Validate and sync active session tokens
- `/api/people` — CRUD operations for citizen identity records
- `/api/save-voter-list-record` — Save and retrieve cached voter list records & portraits
- `/api/voter-search` — Election portal citizen lookup
- `/api/download` — Secure server-side document proxy
- `/api/allowed-ips` — IP allowlisting and security access control
- `/verify/:nin` — Public verification gateway with fallback profile card

---

## Deployment on Vercel

### Deploy the project

```bash
vercel
```

### Production deployment

```bash
vercel --prod
```

### Environment variables in Vercel

Add the following environment variables inside your Vercel Project Settings (**Settings > Environment Variables**):

1. **`MONGODB_URI`**
   - Value: Your primary MongoDB connection string.
2. **`MONGODB_URI_SECOND`**
   - Value: Your secondary MongoDB connection string for voter list storage.

---

## Notes

- This project is intended for authorized administrative use.
- Some verification and download flows depend on remote government services and valid credentials.
- Ensure your environment variables and IP allowlist are configured correctly before production use.

---

## License

This project is intended for internal or organizational use. Please confirm licensing terms before distributing or reusing it in a public environment.
