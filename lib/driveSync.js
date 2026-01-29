import { google } from "googleapis";
import { getDriveFileVersion, upsertDriveFile } from "./db";
import { uploadToFileSearchStore } from "./fileSearch";

const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID;
const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

const GOOGLE_MIME_EXPORTS = new Map([
  ["application/vnd.google-apps.document", "application/pdf"],
  ["application/vnd.google-apps.presentation", "application/pdf"],
  ["application/vnd.google-apps.spreadsheet", "application/pdf"]
]);

function getDriveClient() {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    throw new Error("Missing Google OAuth credentials");
  }
  const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
  auth.setCredentials({ refresh_token: REFRESH_TOKEN });
  return google.drive({ version: "v3", auth });
}

async function listAllFiles(drive) {
  if (!DRIVE_FOLDER_ID) {
    throw new Error("Missing DRIVE_FOLDER_ID");
  }
  const files = [];
  let pageToken;
  do {
    const response = await drive.files.list({
      q: `'${DRIVE_FOLDER_ID}' in parents and trashed = false`,
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

export async function syncDriveToFileSearch() {
  const drive = getDriveClient();
  const files = await listAllFiles(drive);

  const result = {
    status: "completed",
    total: files.length,
    uploaded: 0,
    skipped: 0,
    failed: 0
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
    }
  }

  if (result.failed > 0) {
    result.status = "completed_with_errors";
  }

  return result;
}
