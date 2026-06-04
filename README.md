# YT2 ATT&CK Graph Viewer

Static browser app for exploring MITRE ATT&CK tactics, techniques, groups, malware, campaigns, and procedure relationships.

Public site: https://nafiz99.github.io/yt2-attack-visualizer/

## Local Preview

Serve the `frontend` folder with any static file server listening on port `5500`, then open the application at:

```text
http://localhost:5500/
```

Example command:

```sh
npx serve frontend --listen 5500
```

## Validate the static site

Run the static deployment smoke check before publishing changes:

```sh
npm test
```

The check verifies that the GitHub Pages entry files are present, that `index.html` uses relative asset paths, and that the bundled JSON data files parse successfully.

## Deploy to GitHub Pages

This repository includes a GitHub Actions workflow at `.github/workflows/deploy-pages.yml` that publishes the `frontend` directory to GitHub Pages.

To enable it on GitHub:

1. Push or merge these changes into the repository's `main` branch.
2. In GitHub, open **Settings → Pages** for the repository.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Open the **Actions** tab and run **Deploy GitHub Pages** manually, or wait for the next push to `main`.
5. After the workflow completes, open the Pages URL shown in the workflow summary.

The workflow runs `npm test`, uploads `frontend` as the Pages artifact, and deploys it with GitHub's official Pages deployment actions.

If the repository is still configured to serve Pages from a branch root instead of GitHub Actions, the root `index.html` redirects visitors to `frontend/` so the same public URL continues to work while Pages settings are being migrated.
