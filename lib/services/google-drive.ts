import { google } from 'googleapis';
import { prisma } from '../prisma';

export const getGoogleAuth = async (userId: string) => {
    const account = await prisma.account.findFirst({
        where: { userId, provider: 'google' },
    });

    if (!account || !account.refresh_token) {
        throw new Error(`User ${userId} not connected to Google or missing refresh token`);
    }

    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
        refresh_token: account.refresh_token,
        access_token: account.access_token || undefined,
    });

    // Auto refresh is handled by googleapis if refresh_token is present
    return oauth2Client;
};

export const downloadDriveFile = async (auth: any, fileId: string) => {
    const drive = google.drive({ version: 'v3', auth });
    const res = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'stream' }
    );
    return res.data;
};

export const uploadYouTubeVideo = async (
    auth: any,
    meta: { title: string; description: string; categoryId?: string },
    videoStream: any,
    fileSize: number
) => {
    const youtube = google.youtube({ version: 'v3', auth });

    // Resumable upload is handled by googleapis library automatically if creating a media upload
    const res = await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: {
            snippet: {
                title: meta.title,
                description: meta.description,
                categoryId: meta.categoryId || '22', // People & Blogs default
            },
            status: {
                privacyStatus: 'private', // Default to private
            },
        },
        media: {
            body: videoStream,
            mimeType: 'video/mp4', // Should be dynamic
        },
    });

    return res.data;
};

export const listDriveChanges = async (auth: any, startPageToken: string | null) => {
    const drive = google.drive({ version: 'v3', auth });

    let pageToken = startPageToken;

    // If we don't have a token, we can't list changes efficiently from "beginning of time" without paging everything.
    // Ideally, if startPageToken is null, we fetch the current token and ignore past changes (or list specific folder).
    // Given the context is "monitor changes", getting a fresh token is safer for init.
    if (!pageToken) {
        const tokenRes = await drive.changes.getStartPageToken();
        return { changes: [], newStartPageToken: tokenRes.data.startPageToken };
    }

    const res = await drive.changes.list({
        pageToken,
        spaces: 'drive',
        restrictToMyDrive: true,
        includeRemoved: false,
        fields: 'newStartPageToken, changes(fileId, file(name, mimeType, size, md5Checksum))'
    });

    return {
        changes: res.data.changes,
        newStartPageToken: res.data.newStartPageToken
    };
};

export const ensureAppFolder = async (auth: any, folderName: string = 'ShortsAI Uploads') => {
    const drive = google.drive({ version: 'v3', auth });

    // Check if folder exists
    const res = await drive.files.list({
        q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`,
        spaces: 'drive',
        fields: 'files(id, name)'
    });

    if (res.data.files && res.data.files.length > 0) {
        return res.data.files[0].id!;
    }

    // Create folder
    const folderMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
    };

    const folder = await drive.files.create({
        requestBody: folderMetadata,
        fields: 'id'
    });

    return folder.data.id!;
};

export const initiateResumableUpload = async (auth: any, fileName: string, mimeType: string, folderId?: string) => {
    // Manually initiate upload to get the session URI for the frontend
    // Using axios or fetch to call Google API directly might be needed if googleapis lib is strict,
    // but we can try getting the request object.
    // Actually, simpler to just use Authenticated Gaxios

    // If folderId is not provided, find/create the default app folder
    const targetFolderId = folderId || await ensureAppFolder(auth);

    const token = (await auth.getAccessToken()).token;

    const metadata = {
        name: fileName,
        parents: [targetFolderId],
        mimeType: mimeType
    };

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(metadata)
    });

    if (!res.ok) {
        throw new Error(`Failed to initiate upload: ${res.statusText}`);
    }

    // The session URI is in the Location header
    return res.headers.get('Location');
};
