# Calcium Studio

A personal dashboard with three daily actions, a persistent activity timer,
session notes, a diary, projects, income tracking and an imported field guide.

## Publishing with the existing website

The ready-to-publish app is in `../studio/`. Commit that folder and this source
folder along with the homepage's Studio link, then push the website as usual.
There is no server or database to deploy. Open `studio/index.html` through the
website's normal address. The relative asset paths also support a website hosted
under a repository subpath.

## Personal records

The published app starts empty. Use **Import plan or backup** to select a private
Calcium Studio JSON file. File contents are processed in the browser, not uploaded.
Personal plans, diary entries, session notes and financial records must never be
added to this public repository.

Changes save in localStorage for the current site and browser profile. There is
no sign-in, cloud backup or cross-device sync. Another visitor gets a separate,
empty workspace. Anyone using your browser profile can open your records, and
other scripts on the same website origin share access to localStorage.

Use **Settings & backup → Export my data** regularly. Clearing site data removes
the saved workspace. Localhost, a deployed domain, another browser and another
device each have separate storage; export and import to transfer records.
Importing replaces the current workspace after confirmation and pauses any
timer at the time the backup was exported.

## Development

With Node 22.13 or newer, from this folder:

```sh
npm ci
npm run dev
```

After editing:

```sh
npm run check
npm test
npm run build
```

The build updates only `../studio/`. Commit the rebuilt files too; pushing source
alone does not rebuild a plain static website.

For an optional local preview populated with a private plan, put its absolute
path in an ignored `.env.local` file as `STUDIO_PRIVATE_PLAN="/path/to/plan.json"`.
Keep that JSON outside this repository. This option serves the file only in
local development and imports only when this browser has no existing workspace.
Neither the endpoint nor the plan is included in the production build.

The UI uses locally served Space Grotesk and IBM Plex Mono fonts. Future Supabase
sync can replace the storage adapter while retaining the existing data model.
