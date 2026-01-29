import { google } from "googleapis";
import { getDriveFileVersion, getSetting, setSetting, upsertDriveFile } from "./db";
import { uploadToFileSearchStore } from "./fileSearch";

const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID;
const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

const SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];

const GOOGLE_MIME_EXPORTS = new Map([
  ["application/vnd.google-apps.document", "application/pdf"],
  ["application/vnd.google-apps.presentation", "application/pdf"],
  ["application/vnd.google-apps.spreadsheet", "application/pdf"]
]);

function getRefreshToken() {
  return REFRESH_TOKEN || getSetting("google_refresh_token");
}

function getOAuthClient(redirectUri) {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    const error = new Error("Missing Google OAuth client credentials");
    error.code = "MISSING_OAUTH_CONFIG";
    throw error;
  }
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, redirectUri);
}

export function getAuthUrl(redirectUri, state) {
  const auth = getOAuthClient(redirectUri);
  return auth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state
  });
}

export async function exchangeCodeForTokens(code, redirectUri) {
  const auth = getOAuthClient(redirectUri);
  const { tokens } = await auth.getToken(code);
  if (!tokens.refresh_token) {
    return { ok: false, error: "missing_refresh_token" };
  }
  setSetting("google_refresh_token", tokens.refresh_token);
  return { ok: true };
}

function getDriveClient(redirectUri) {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    const error = new Error("Missing Google OAuth refresh token");
    error.code = "NEEDS_OAUTH";
    throw error;
  }
  const auth = getOAuthClient(redirectUri);
  auth.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: "v3", auth });
}

function getDriveFolderId() {
  return getSetting("drive_folder_id") || DRIVE_FOLDER_ID || "";
}

async function listAllFiles(drive) {
  const folderId = getDriveFolderId();
  if (!folderId) {
    throw new Error("Missing DRIVE_FOLDER_ID");
  }
  const files = [];
  let pageToken;
  do {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, modifiedTime, md5Checksum, version)",
      pageToken
    });
    files.push(...(response.data.files || []));
    pageToken = response.data.nextPageToken;
  } while (pageToken);
  return files.filter((file) => file.mimeType !== "application/vnd.google-apps.folder");
}

async function downloadFile(drive, file) {
  const exportType = GOOGLE_MIME_EXPORTS.get(file.mimeType);
  if (exportType) {
    const response = await drive.files.export(
      { fileId: file.id, mimeType: exportType },
      { responseType: "arraybuffer" }
    );
    return { buffer: Buffer.from(response.data), mimeType: exportType };
  }

  const response = await drive.files.get(
    { fileId: file.id, alt: "media" },
    { responseType: "arraybuffer" }
  );
  return { buffer: Buffer.from(response.data), mimeType: file.mimeType };
}

export async function syncDriveToFileSearch(redirectUri) {
  const drive = getDriveClient(redirectUri);
  const files = await listAllFiles(drive);

  const result = {
    status: "completed",
    total: files.length,
    uploaded: 0,
    skipped: 0,
    failed: 0,
    errors: []
  };

  for (const file of files) {
    const version = file.version || file.md5Checksum || file.modifiedTime || "";
    const existingVersion = getDriveFileVersion(file.id);
    if (existingVersion && existingVersion === version) {
      result.skipped += 1;
      continue;
    }

    try {
      const downloaded = await downloadFile(drive, file);
      await uploadToFileSearchStore({
        buffer: downloaded.buffer,
        filename: file.name,
        mimeType: downloaded.mimeType
      });
      upsertDriveFile(file.id, version);
      result.uploaded += 1;
    } catch (error) {
      result.failed += 1;
      const message = error?.message || "Unknown error";
      result.errors.push({
        fileId: file.id,
        name: file.name,
        mimeType: file.mimeType,
        error: message
      });
      console.error("Drive sync failed", file.id, file.name, message);
    }
  }

  if (result.failed > 0) {
    result.status = "completed_with_errors";
  }

  if (result.errors.length > 10) {
    result.errors = result.errors.slice(0, 10);
  }

  return result;
}
