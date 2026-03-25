# Israel Alert Dashboard

A real-time dashboard for monitoring Israeli emergency alerts (OREF) and live feeds (Emess).

## Features

- 🚨 Real-time alert monitoring with customizable location filtering
- 🔊 Custom alert sounds for different alert types (Active, Resolved, Expected)
- 📱 Desktop notifications support
- 🎨 Dark-themed cyberpunk aesthetic
- ⚙️ Customizable settings (polling interval, font size, volume, etc.)
- 📊 Live ticker of recent alerts

## Deployment

### Cloudflare Workers (Recommended)

This project is configured for deployment to Cloudflare Workers with automatic CI/CD.

#### Setup:

1. **Install Wrangler CLI** (if not already installed):
   ```bash
   npm install -g wrangler
   ```

2. **Login to Cloudflare**:
   ```bash
   wrangler login
   ```

3. **Get your Cloudflare credentials**:
   - Account ID: Found in your Cloudflare dashboard URL or Workers overview page
   - API Token: Create one at https://dash.cloudflare.com/profile/api-tokens
     - Use the "Edit Cloudflare Workers" template
     - Or create a custom token with `Workers Scripts:Edit` permission

4. **Set up GitHub Secrets**:
   Go to your repo settings → Secrets and variables → Actions, then add:
   - `CLOUDFLARE_API_TOKEN` - Your Cloudflare API token
   - `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID

5. **Deploy**:
   - **Automatic**: Push to `master` branch and GitHub Actions will deploy automatically
   - **Manual**: Run `wrangler deploy` locally

#### Local Development:

```bash
# Run locally
wrangler dev

# Open in browser - the dashboard will be available at http://localhost:8787
```

## Usage

1. Start the proxy server (if running locally without Cloudflare Workers):
   ```bash
   node proxy.mjs
   ```

2. Open `dashboard.html` in your browser

3. Configure settings:
   - Set your location filter (default: בית שמש)
   - Upload custom alert sounds (optional)
   - Adjust polling interval and volume

## Configuration

The dashboard polls two endpoints:
- OREF alerts: `/oref` (default), with optional `/oref-live`, `/oref-primary`, and `/oref-history` for troubleshooting
- Emess feed: `/emess`

Both are proxied through the included `proxy.mjs` server to handle CORS.

## Versioning

The UI shows a small version label in the header. Increment `CONFIG.app.version` in `assets/dashboard.html` every time updates are pushed so deployments are easy to verify.

## License

MIT
