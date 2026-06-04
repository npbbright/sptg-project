# SPTG

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Production

```bash
npm install
npm run build
npm start
```

The server reads:

- `PORT`: server port, defaults to `3000`
- `DATABASE_PATH`: SQLite database path, defaults to `./database.sqlite`
- `UPLOAD_DIR`: uploaded PDF folder, defaults to `./uploads`

## Deploy Notes

Use these commands on a Node.js host:

- Build command: `npm install && npm run build`
- Start command: `npm start`

If the host has persistent disk storage, point both data paths to that disk:

```bash
DATABASE_PATH=/data/database.sqlite
UPLOAD_DIR=/data/uploads
```

Sessions are stored in memory and expire after 1 day, so users need to login again after a server restart.
