import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { AI_CONFIG } from '@/server/config/ai.config';

/**
 * Storage Client Implementation
 * 
 * Complies with uploads-and-storage.md & AGENTS.md:
 * - Files NEVER live in PostgreSQL database. Only storage keys live in DB.
 * - Server-side validation of file size and MIME type.
 * - Storage keys are opaque, non-sequential strings.
 * - Documented local storage equivalent for development.
 */

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

async function ensureUploadsDirExists(): Promise<void> {
  try {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create uploads directory:', error);
    throw new Error('Storage initialization failed');
  }
}

export interface StoredFile {
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
}

export const storageClient = {
  /**
   * Save an uploaded file buffer to local object storage equivalent.
   * Validates size and mime type server-side before persisting.
   */
  async saveFile(file: File): Promise<StoredFile> {
    // 1. Server-side file size validation
    if (file.size <= 0) {
      throw new Error('Cannot upload empty file');
    }

    if (file.size > AI_CONFIG.storage.maxFileSizeBytes) {
      const maxMb = AI_CONFIG.storage.maxFileSizeBytes / (1024 * 1024);
      throw new Error(`File size exceeds maximum limit of ${maxMb}MB`);
    }

    // 2. Server-side MIME type validation
    const mimeType = file.type || 'application/octet-stream';
    const isAllowedType = (AI_CONFIG.storage.allowedMimeTypes as readonly string[]).includes(mimeType);

    if (!isAllowedType) {
      throw new Error(`File type '${mimeType}' is not supported. Allowed types: ${AI_CONFIG.storage.allowedMimeTypes.join(', ')}`);
    }

    await ensureUploadsDirExists();

    // 3. Generate opaque, non-sequential storage key
    const randomHash = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.name) || '.bin';
    const storageKey = `doc_${Date.now()}_${randomHash}${ext}`;

    // 4. Save file to disk
    const targetPath = path.join(UPLOADS_DIR, storageKey);
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.writeFile(targetPath, buffer);

    return {
      storageKey,
      originalFilename: file.name,
      mimeType,
      fileSizeBytes: file.size,
    };
  },

  /**
   * Save multiple uploaded files to storage and return unified metadata.
   */
  async saveMultipleFiles(files: File[]): Promise<StoredFile & { individualFiles: StoredFile[] }> {
    if (!files || files.length === 0) {
      throw new Error('Cannot upload empty file list');
    }

    if (files.length === 1) {
      const single = await this.saveFile(files[0]);
      return {
        ...single,
        individualFiles: [single],
      };
    }

    const storedFiles: StoredFile[] = [];
    let totalSize = 0;

    for (const file of files) {
      const stored = await this.saveFile(file);
      storedFiles.push(stored);
      totalSize += stored.fileSizeBytes;
    }

    const combinedNames = files.map((f) => f.name).join(', ');
    const compositeFilename = `${files.length} files (${combinedNames})`;
    // Store JSON encoded array of stored files as the storage key
    const compositeStorageKey = JSON.stringify(storedFiles);

    return {
      storageKey: compositeStorageKey,
      originalFilename: compositeFilename,
      mimeType: storedFiles[0].mimeType || 'application/octet-stream',
      fileSizeBytes: totalSize,
      individualFiles: storedFiles,
    };
  },

  /**
   * Retrieve file buffer by storage key
   */
  async getFileBuffer(storageKey: string): Promise<Buffer> {
    const filePath = path.join(UPLOADS_DIR, storageKey);
    try {
      return await fs.readFile(filePath);
    } catch (error) {
      throw new Error(`Storage file not found for key: ${storageKey}`);
    }
  },

  /**
   * Delete stored file
   */
  async deleteFile(storageKey: string): Promise<void> {
    const filePath = path.join(UPLOADS_DIR, storageKey);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  },
};