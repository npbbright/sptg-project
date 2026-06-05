import express from "express";
import cors from "cors";
import multer from "multer";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { initDB } from "./db";

const app = express();
const sessionCookieName = "sptg_session";
const sessionMaxAgeMs = 24 * 60 * 60 * 1000;
const port = Number(process.env.PORT || 3000);
const publicDir = path.join(process.cwd(), "public");
const uploadDir =
  process.env.UPLOAD_DIR ||
  path.join(process.cwd(), "uploads");
const sessions = new Map<
  string,
  {
    username: string;
    expiresAt: number;
  }
>();

fs.mkdirSync(uploadDir, { recursive: true });

app.use(cors());
app.use(express.json());

const pageRoutes = [
  { route: "/", file: "login_page.html" },
  { route: "/index", file: "login_page.html" },
  { route: "/login", file: "login_page.html" },
  { route: "/admin", file: "admin.html" },
  { route: "/home", file: "landing.html" },
  { route: "/upload", file: "upload_files.html" },
  { route: "/files", file: "downlod_files.html" },
  { route: "/record", file: "record_score.html" },
  { route: "/edit_record", file: "edit_record.html" },
  { route: "/record-report", file: "record_report.html" },
  { route: "/leaderboard", file: "leaderboard.html" },
  { route: "/register", file: "register.html" },
  { route: "/show", file: "show.html" },
  { route: "/layout", file: "layout.html" }
];

function parseCookies(req: express.Request) {
  return (req.headers.cookie || "")
    .split(";")
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((cookies, cookie) => {
      const separatorIndex = cookie.indexOf("=");

      if (separatorIndex === -1) {
        return cookies;
      }

      const name = cookie.slice(0, separatorIndex);
      const value = cookie.slice(separatorIndex + 1);

      cookies[name] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function getSession(req: express.Request) {
  const cookies = parseCookies(req);
  const sessionId = cookies[sessionCookieName];

  if (!sessionId) {
    return null;
  }

  const session = sessions.get(sessionId);

  if (!session) {
    return null;
  }

  if (session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return null;
  }

  return {
    id: sessionId,
    ...session
  };
}

function createSession(
  res: express.Response,
  username: string
) {
  const sessionId = randomUUID();

  sessions.set(sessionId, {
    username,
    expiresAt: Date.now() + sessionMaxAgeMs
  });

  res.cookie(sessionCookieName, sessionId, {
    httpOnly: true,
    maxAge: sessionMaxAgeMs,
    sameSite: "lax"
  });
}

function clearSession(
  req: express.Request,
  res: express.Response
) {
  const session = getSession(req);

  if (session) {
    sessions.delete(session.id);
  }

  res.clearCookie(sessionCookieName, {
    sameSite: "lax"
  });
}

pageRoutes.forEach(({ route, file }) => {
  app.get(route, (req, res) => {
    const session = getSession(req);
    const isLoginPage =
      route === "/" ||
      route === "/index" ||
      route === "/login";
    const isPublicPage =
      isLoginPage ||
      route === "/register";

    if (isLoginPage && session) {
      res.redirect("/home");
      return;
    }

    if (!isPublicPage && !session) {
      res.redirect("/");
      return;
    }

    res.sendFile(file, { root: publicDir });
  });
});

app.use((req, res, next) => {
  if (!req.path.endsWith(".html")) {
    next();
    return;
  }

  const session = getSession(req);
  const isLoginFile =
    req.path === "/login_page.html" ||
    req.path === "/index.html";
  const isPublicFile =
    isLoginFile ||
    req.path === "/register.html";

  if (isLoginFile && session) {
    res.redirect("/home");
    return;
  }

  if (!isPublicFile && !session) {
    res.redirect("/");
    return;
  }

  next();
});

app.use(express.static(publicDir));
app.use("/uploads", (req, res, next) => {
  if (!getSession(req)) {
    res.redirect("/");
    return;
  }

  next();
});
app.use("/uploads", express.static(uploadDir));

let db: Awaited<ReturnType<typeof initDB>>;

function isAdminRequest(req: express.Request) {
  return getSession(req)?.username === "admin";
}

function requireAdmin(
  req: express.Request,
  res: express.Response
) {
  if (!isAdminRequest(req)) {
    res.status(403).json({
      success: false,
      message: "Admin access only"
    });
    return false;
  }

  return true;
}

function requireSession(
  req: express.Request,
  res: express.Response
) {
  const session = getSession(req);

  if (!session) {
    res.status(401).json({
      success: false,
      message: "Session expired. Please login again."
    });
    return null;
  }

  return session;
}

app.use("/api", (req, res, next) => {
  const publicApiPaths = [
    "/login",
    "/register",
    "/logout"
  ];

  if (publicApiPaths.includes(req.path)) {
    next();
    return;
  }

  if (!requireSession(req, res)) {
    return;
  }

  next();
});

const storage = multer.diskStorage({
  destination: (_, __, cb) => {
    cb(null, uploadDir);
  },
  filename: (_, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files allowed"));
    }
  },
});

app.post("/api/upload", upload.single("pdf"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({
      error: "No file uploaded",
    });
    return;
  }

  await db.run(
    `INSERT INTO pdf_files(filename, filepath)
     VALUES (?, ?)`,
    [req.file.originalname, req.file.filename]
  );

  res.json({
    success: true,
  });
});

app.get("/api/files", async (_, res) => {
  const files = await db.all(
    "SELECT * FROM pdf_files ORDER BY id DESC"
  );

  res.json(files);
});

app.get("/api/score-report", async (req, res) => {
  const session = requireSession(req, res);

  if (!session) {
    return;
  }

  const { from, to } = req.query;
  const filters = ["username = ?"];
  const params = [session.username];

  if (typeof from === "string" && from) {
    filters.push("date(tested_data) >= date(?)");
    params.push(from);
  }

  if (typeof to === "string" && to) {
    filters.push("date(tested_data) <= date(?)");
    params.push(to);
  }

  const whereClause =
    filters.length > 0
      ? `WHERE ${filters.join(" AND ")}`
      : "";

  const summary = await db.all(
    `
    SELECT
      skill_type,
      test_name,
      COUNT(*) AS record_count,
      SUM(correct_score) AS correct_score,
      SUM(attempt_score) AS attempt_score,
      SUM(total) AS total,
      CASE
        WHEN SUM(attempt_score) > 0
        THEN ROUND((SUM(correct_score) * 100.0) / SUM(attempt_score), 2)
        ELSE 0
      END AS accuracy_percent,
      CASE
        WHEN SUM(total) > 0
        THEN ROUND((SUM(correct_score) * 100.0) / SUM(total), 2)
        ELSE 0
      END AS correction_rate_percent
    FROM score
    ${whereClause}
    GROUP BY skill_type, test_name
    ORDER BY skill_type, test_name
    `,
    params
  );

  res.json(summary);
});

app.get("/api/score-report-graph", async (req, res) => {
  const session = requireSession(req, res);

  if (!session) {
    return;
  }

  const { from, to } = req.query;
  const filters = [
    "tested_data IS NOT NULL",
    "username = ?"
  ];
  const params = [session.username];

  if (typeof from === "string" && from) {
    filters.push("date(tested_data) >= date(?)");
    params.push(from);
  }

  if (typeof to === "string" && to) {
    filters.push("date(tested_data) <= date(?)");
    params.push(to);
  }

  const graphRows = await db.all(
    `
    SELECT
      date(tested_data) AS tested_date,
      skill_type,
      SUM(correct_score) AS score
    FROM score
    WHERE ${filters.join(" AND ")}
    GROUP BY date(tested_data), skill_type
    ORDER BY tested_date, skill_type
    `,
    params
  );

  res.json(graphRows);
});

app.get("/api/leaderboard", async (req, res) => {
  const session = requireSession(req, res);

  if (!session) {
    return;
  }

  const users = await db.all(
    `
    SELECT
      username,
      COUNT(*) AS record_count,
      ROUND(
        AVG(
          CASE
            WHEN total > 0
            THEN (correct_score * 100.0) / total
            ELSE 0
          END
        ),
        2
      ) AS correction_rate_percent,
      ROUND(
        AVG(
          CASE
            WHEN attempt_score > 0
            THEN (correct_score * 100.0) / attempt_score
            ELSE 0
          END
        ),
        2
      ) AS accuracy_percent,
      SUM(correct_score) AS correct_score,
      SUM(attempt_score) AS attempt_score,
      SUM(total) AS total
    FROM score
    GROUP BY username
    `
  );

  const rankedUsers = users
    .map((user) => ({
      ...user,
      correction_rate_percent: Number(user.correction_rate_percent || 0),
      accuracy_percent: Number(user.accuracy_percent || 0),
      correct_score: Number(user.correct_score || 0),
      attempt_score: Number(user.attempt_score || 0),
      total: Number(user.total || 0),
      record_count: Number(user.record_count || 0)
    }))
    .sort((left, right) =>
      right.correction_rate_percent - left.correction_rate_percent ||
      right.accuracy_percent - left.accuracy_percent ||
      right.correct_score - left.correct_score ||
      left.username.localeCompare(right.username)
    )
    .map((user, index) => ({
      ...user,
      rank: index + 1,
      is_current_user: user.username === session.username
    }));

  const currentUser =
    rankedUsers.find((user) => user.username === session.username) || null;

  res.json({
    top10: rankedUsers.slice(0, 10),
    currentUser,
    totalUsers: rankedUsers.length
  });
});

app.get("/api/admin/score", async (req, res) => {
  if (!requireAdmin(req, res)) {
    return;
  }

  const { start_date, end_date, username } = req.query;

  if (
    typeof start_date !== "string" ||
    !start_date ||
    typeof end_date !== "string" ||
    !end_date
  ) {
    res.status(400).json({
      success: false,
      message: "start_date and end_date are required"
    });
    return;
  }

  const filters = [
    "date(tested_data) >= date(?)",
    "date(tested_data) <= date(?)"
  ];
  const params = [start_date, end_date];

  if (typeof username === "string" && username.trim()) {
    filters.push("username = ?");
    params.push(username.trim());
  }

  const scores = await db.all(
    `
    SELECT *
    FROM score
    WHERE ${filters.join(" AND ")}
    ORDER BY tested_data DESC, id DESC
    `,
    params
  );

  res.json(scores);
});

app.get("/api/edit-record", async (req, res) => {
  const session = requireSession(req, res);

  if (!session) {
    return;
  }

  const { start_date, started_date, end_date } = req.query;
  const effectiveStartDate =
    typeof start_date === "string"
      ? start_date
      : started_date;

  if (
    typeof effectiveStartDate !== "string" ||
    !effectiveStartDate ||
    typeof end_date !== "string" ||
    !end_date
  ) {
    res.status(400).json({
      success: false,
      message: "start_date and end_date are required"
    });
    return;
  }

  const scores = await db.all(
    `
    SELECT *
    FROM score
    WHERE username = ?
    AND date(tested_data) >= date(?)
    AND date(tested_data) <= date(?)
    ORDER BY tested_data DESC, id DESC
    `,
    [session.username, effectiveStartDate, end_date]
  );

  res.json(scores);
});

app.put("/api/edit-record", async (req, res) => {
  const session = requireSession(req, res);

  if (!session) {
    return;
  }

  const { rows } = req.body;

  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({
      success: false,
      message: "rows are required"
    });
    return;
  }

  await db.exec("BEGIN");

  try {
    const updateSql = `
      UPDATE score
      SET
        tested_data = ?,
        correct_score = ?,
        attempt_score = ?,
        total = ?
      WHERE id = ?
      AND username = ?
    `;

    let updated = 0;

    for (const row of rows) {
      if (!row || typeof row !== "object") {
        throw new Error("Each row must be an object");
      }

      const id = Number(row.id);

      if (!Number.isInteger(id) || id <= 0) {
        throw new Error("Every row must include a valid id");
      }

      const params = [
        row.tested_data || null,
        Number(row.correct_score || 0),
        Number(row.attempt_score || 0),
        row.total === "" || row.total === null || row.total === undefined
          ? null
          : Number(row.total),
        id
      ];

      params.push(session.username);

      const result = await db.run(updateSql, params);
      updated += result.changes || 0;
    }

    await db.exec("COMMIT");

    res.json({
      success: true,
      updated
    });
  } catch (error) {
    await db.exec("ROLLBACK");

    res.status(400).json({
      success: false,
      message: error instanceof Error
        ? error.message
        : String(error)
    });
  }
});

app.delete("/api/admin/score", async (req, res) => {
  if (!requireAdmin(req, res)) {
    return;
  }

  const result = await db.run("DELETE FROM score");

  res.json({
    success: true,
    deleted: result.changes || 0
  });
});

app.delete("/api/admin/score/:id", async (req, res) => {
  if (!requireAdmin(req, res)) {
    return;
  }

  const result = await db.run(
    "DELETE FROM score WHERE id = ?",
    [req.params.id]
  );

  res.json({
    success: true,
    deleted: result.changes || 0
  });
});

app.delete("/api/admin/pdf-files", async (req, res) => {
  if (!requireAdmin(req, res)) {
    return;
  }

  const result = await db.run("DELETE FROM pdf_files");

  res.json({
    success: true,
    deleted: result.changes || 0
  });
});

app.delete("/api/admin/pdf-files/:id", async (req, res) => {
  if (!requireAdmin(req, res)) {
    return;
  }

  const result = await db.run(
    "DELETE FROM pdf_files WHERE id = ?",
    [req.params.id]
  );

  res.json({
    success: true,
    deleted: result.changes || 0
  });
});

async function start() {
  db = await initDB();

  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}
app.post("/api/register", async (req, res) => {

  const { username, password } = req.body;

  const existing = await db.get(
    "SELECT * FROM accounts WHERE username = ?",
    [username]
  );

  if (existing) {
    res.json({
      success: false,
      message: "Username already exists"
    });
    return;
  }

  await db.run(
    `
    INSERT INTO accounts
    (username, password)
    VALUES (?, ?)
    `,
    [username, password]
  );

  res.json({
    success: true
  });

});
app.post("/api/login", async (req, res) => {

  const { username, password } = req.body;

  const user = await db.get(
    `
    SELECT *
    FROM accounts
    WHERE username = ?
    AND password = ?
    `,
    [username, password]
  );

  if (!user) {
    res.status(401).json({
      success: false,
      message: "Invalid username or password"
    });
    return;
  }

  createSession(res, user.username);

  res.json({
    success: true,
    username: user.username
  });
});

app.post("/api/logout", (req, res) => {
  clearSession(req, res);

  res.json({
    success: true
  });
});

app.post('/api/score', async (req, res) => {

    try {

        const session = requireSession(req, res);

        if (!session) {
            return;
        }

        const { scores } = req.body;

        if (!Array.isArray(scores)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid request'
            });
        }

        const stmt = await db.prepare(`
            INSERT INTO score (
                username,
                skill_type,
                test_name,
                tested_data,
                testing_date,
                correct_score,
                attempt_score,
                total
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const item of scores) {

            await stmt.run(
                session.username,
                item.skill_type || item.skillName,
                item.test_name || item.testName,
                item.tested_data || null,
                item.testing_date || new Date().toISOString(),
                item.correct_score ?? item.score,
                item.attempt_score ?? item.attempt,
                item.total
            );
        }

        await stmt.finalize();

        res.json({
            success: true,
            count: scores.length
        });

    } catch (error) {

    console.error(error);

    res.status(500).json({
        success: false,
        message: error instanceof Error
            ? error.message
            : String(error)
    });
}

});


start();
