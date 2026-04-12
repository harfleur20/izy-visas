# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/08d22c82-18f9-4436-b150-f41f9d7d9c43

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/08d22c82-18f9-4436-b150-f41f9d7d9c43) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/08d22c82-18f9-4436-b150-f41f9d7d9c43) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## Lovable Cloud setup for this project

This project appears to use Lovable Cloud with a Supabase-backed managed backend.

- Lovable project: https://lovable.dev/projects/08d22c82-18f9-4436-b150-f41f9d7d9c43
- Published app: `https://izy-visas.lovable.app`
- Backend project ref used by the code: `ormvdwjcanakbyhqjasz`

### Important note about CLI access

If this project is managed by Lovable Cloud, the underlying Supabase project may not be directly accessible from a personal Supabase CLI session. In practice:

- manage backend secrets from Lovable Cloud
- publish backend/frontend changes from Lovable
- use local `.env` only for local development

### Secrets to configure in Lovable Cloud

Configure these secrets in the project's Cloud/Secrets settings.

Required for the current backend:

```env
OPENLEGI_MCP_TOKEN=
ANTHROPIC_API_KEY=
MISTRAL_API_KEY=
YOUSIGN_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
PISTE_CLIENT_ID=
PISTE_CLIENT_SECRET=
MSB_API_KEY_TEST=
```

Required after the block 1 security hardening:

```env
APP_BASE_URL=https://izy-visas.lovable.app
CAPDEMARCHES_WEBHOOK_SECRET=
YOUSIGN_API_URL=https://api-sandbox.yousign.app/v3
YOUSIGN_ALLOW_TEST_OTP=false
MSB_ENV=test
```

`CAPDEMARCHES_WEBHOOK_SECRET` is also accepted for protected CAPDEMARCHES maintenance calls.

Optional / feature-dependent:

```env
GOOGLE_VISION_API_KEY=
MSB_API_KEY_LIVE=
WHATSAPP_API_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
```

### Local env files

- `.env`: local real values, never share
- `.env.example`: template without secrets

### Publishing workflow

When backend files under `supabase/functions/` change:

1. update the required secrets in Lovable Cloud
2. sync/publish the project from Lovable
3. verify the affected flows in the published app

### Block 1 reminder

Before considering the security block closed:

- add `OPENLEGI_MCP_TOKEN` in Lovable Cloud secrets
- add `APP_BASE_URL`
- add `CAPDEMARCHES_WEBHOOK_SECRET`
- add `STRIPE_WEBHOOK_SECRET` after creating the Stripe webhook endpoint
- keep `YOUSIGN_ALLOW_TEST_OTP=false`
- rotate the previously exposed OpenLégi token
# LogicielDeContestationVisa
