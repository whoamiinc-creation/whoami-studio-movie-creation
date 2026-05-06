import * as fs from "fs";
import * as http from "http";
import * as path from "path";
import * as url from "url";
import { google } from "googleapis";
import open from "open";
import dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "../.env") });

const TOKEN_PATH = path.join(__dirname, "../.youtube-token.json");
const VIDEO_PATH = path.join(__dirname, "../out/video.mp4");
const PORT = 3000;

const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  process.env.YOUTUBE_REDIRECT_URI
);

function saveToken(token: object) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
  console.log("Token saved to", TOKEN_PATH);
}

function loadToken(): object | null {
  if (fs.existsSync(TOKEN_PATH)) {
    return JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
  }
  return null;
}

function runAuthFlow(): Promise<void> {
  return new Promise((resolve, reject) => {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: ["https://www.googleapis.com/auth/youtube.upload"],
      login_hint: "sonokenno25@gmail.com",
    });

    console.log("Opening browser for authentication...");
    open(authUrl);

    const server = http.createServer(async (req, res) => {
      const parsed = url.parse(req.url ?? "", true);
      const code = parsed.query.code as string | undefined;

      if (!code) {
        res.end("No code found. Please try again.");
        server.close();
        reject(new Error("No code in callback URL"));
        return;
      }

      res.end("<html><body><h2>Authentication successful! You can close this tab.</h2></body></html>");
      server.close();

      try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        saveToken(tokens);
        resolve();
      } catch (err) {
        reject(err);
      }
    });

    server.listen(PORT, () => {
      console.log(`Waiting for OAuth2 callback on http://localhost:${PORT}`);
    });
  });
}

async function uploadVideo() {
  if (!fs.existsSync(VIDEO_PATH)) {
    throw new Error(`Video file not found: ${VIDEO_PATH}\nRun "npm run render" first.`);
  }

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });
  const fileSize = fs.statSync(VIDEO_PATH).size;

  console.log(`Uploading ${VIDEO_PATH} (${(fileSize / 1024 / 1024).toFixed(1)} MB)...`);

  const response = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: "Geometric Abstract Animation #Shorts",
        description: "Abstract geometric animation. #Shorts #geometric #animation #abstract",
        tags: ["Shorts", "animation", "geometric", "abstract", "generative art", "neon"],
        categoryId: "22",
      },
      status: {
        privacyStatus: "private",
      },
    },
    media: {
      body: fs.createReadStream(VIDEO_PATH),
    },
  });

  console.log(`Upload complete! Video ID: ${response.data.id}`);
  console.log(`View at: https://studio.youtube.com/video/${response.data.id}/edit`);
}

async function main() {
  const existing = loadToken();
  if (existing) {
    oauth2Client.setCredentials(existing as Parameters<typeof oauth2Client.setCredentials>[0]);
    console.log("Using cached token.");
  } else {
    console.log("No cached token found. Starting OAuth2 flow...");
    await runAuthFlow();
  }

  await uploadVideo();
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
