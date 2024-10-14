// pages/api/upload-files.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { IncomingForm, Fields, Files, File } from 'formidable';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import pLimit from 'p-limit';
import { progressStore } from '../../lib/progressStore';

// Disable Next.js body parsing, since we're handling it with `formidable`
export const config = {
  api: {
    bodyParser: false,
  },
};

// Environment variables
const nodeUploadDirectory =
  process.env.LOCAL_FILE_UPLOAD_DIRECTORY ||
  process.env.FILE_UPLOAD_DIRECTORY ||
  './data/uploads';
const langflowDownloadDirectory =
  process.env.FILE_UPLOAD_DIRECTORY || '/data-uploads';

// Helper to normalize paths for Linux compatibility
const unixifyPath = (inputPath: string) => inputPath.replace(/\\/g, '/');

// Extend File type to include webkitRelativePath
interface FileWithRelativePath extends File {
  webkitRelativePath?: string;
}

export default async function handleFileUpload(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res
      .status(405)
      .json({ success: false, message: `Method ${req.method} Not Allowed` });
  }

  try {
    console.log('Starting file upload handling');

    const { fields, files } = await parseForm(req);

    const collectionName = extractField(fields, 'collectionName');
    const labels = extractLabels(fields);

    const uploadId = extractField(fields, 'uploadId');
    if (!uploadId) {
      return res
        .status(400)
        .json({ success: false, message: 'Upload ID is required.' });
    }

    if (!collectionName) {
      return res
        .status(400)
        .json({ success: false, message: 'Collection name is required.' });
    }

    console.log('Backend Received Upload ID:', uploadId);

    // Define collection path
    const collectionPath = path.join(nodeUploadDirectory, collectionName);
    if (fs.existsSync(collectionPath)) {
      return res
        .status(409)
        .json({ success: false, message: 'Collection already exists.' });
    }

    fs.mkdirSync(collectionPath, { recursive: true });
    console.log('Created collection directory:', collectionPath);

    const uploadedFiles = Array.isArray(files.files) ? files.files : [files.files];
    const validFiles = uploadedFiles.filter(
      (file): file is FileWithRelativePath => file !== undefined
    );

    // Initialize progress in the store
    progressStore.set(uploadId, {
      totalFiles: validFiles.length,
      processedFiles: 0,
      processingFiles: [],
      isComplete: false,
    });
    // console.log('Initialized progressStore for Upload ID:', uploadId);

    // Handle file copying
    handleFiles(validFiles, collectionPath);

    // Save metadata
    saveMetadata(collectionPath, labels);

    // Start processing files asynchronously
    processFiles(validFiles, unixifyPath(langflowDownloadDirectory), collectionName, labels, uploadId)
      .then(() => {
        // console.log('File processing completed successfully.');
        // Mark as complete instead of deleting
        const progress = progressStore.get(uploadId);
        if (progress) {
          progress.isComplete = true;
          progressStore.set(uploadId, progress);
          // console.log(`Marked progress as complete for Upload ID ${uploadId}.`);

          // Schedule deletion after 5 minutes to prevent memory leaks
          setTimeout(() => {
            progressStore.delete(uploadId);
            // console.log(`Progress data for Upload ID ${uploadId} has been deleted after completion.`);
          }, 5 * 60 * 1000); // 5 minutes
        }
      })
      .catch((error) => {
        console.error('Error during file processing:', error);
        // Remove progress from the store in case of error
        progressStore.delete(uploadId);
        console.log(`Progress data for Upload ID ${uploadId} has been deleted due to an error.`);
      });

    // Respond immediately to the frontend with uploadId
    return res.status(200).json({ success: true, message: 'Files uploaded and processing started.', uploadId });
  } catch (error) {
    console.error('Error processing file upload:', error);
    // Attempt to parse form to extract uploadId for cleanup
    try {
      const parsedBody = await parseForm(req);
      const uploadId = extractField(parsedBody.fields, 'uploadId');
      if (uploadId) {
        progressStore.delete(uploadId);
        console.log(`Progress data for Upload ID ${uploadId} has been deleted due to an error.`);
      }
    } catch (parseError) {
      console.error('Error parsing form data during error handling:', parseError);
    }
    return res.status(500).json({
      success: false,
      message:
        error instanceof Error ? error.message : 'An unknown error occurred.',
    });
  }
}

// Parse incoming form data
async function parseForm(
  req: NextApiRequest
): Promise<{ fields: Fields; files: Files }> {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({ multiples: true, keepExtensions: true });
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      resolve({ fields, files });
    });
  });
}

// Extract specific field from form data
function extractField(fields: Fields, fieldName: string): string | undefined {
  const value = fields[fieldName];
  return Array.isArray(value) ? value[0] : value;
}

// Extract labels from form data
function extractLabels(fields: Fields): { [key: string]: string }[] {
  const labelsField = extractField(fields, 'labels');
  try {
    const parsedLabels = labelsField ? JSON.parse(labelsField) : [];
    // Transform into the expected array of objects format
    return parsedLabels.map((label: { key: string; value: string }) => {
      return { [label.key]: label.value };
    });
  } catch (error) {
    console.error('Error parsing labels:', error);
    return [];
  }
}

// Handle copying files to destination
function handleFiles(
  files: FileWithRelativePath[],
  collectionPath: string
) {
  files.forEach((file) => {
    const relativePath =
      file.webkitRelativePath || file.originalFilename || file.newFilename;
    const isPartOfDirectory = relativePath.includes('/');
    const destinationPath = isPartOfDirectory
      ? path.join(collectionPath, relativePath)
      : path.join(collectionPath, path.basename(relativePath));

    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.copyFileSync(file.filepath, destinationPath);
    console.log('Copied file to:', destinationPath);
  });
}

// Save metadata to collection path
function saveMetadata(collectionPath: string, labels: object) {
  const metadataPath = path.join(collectionPath, '.metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(labels, null, 2));
  console.log('Metadata saved to:', metadataPath);
}

// Process files by making external API calls
async function processFiles(
  files: FileWithRelativePath[],
  langflowCollectionPath: string,
  collectionName: string,
  labels: { [key: string]: string }[],
  uploadId: string
) {
  const apiUrl = 'http://localhost:7860/api/v1/run/server-file-loader';

  const defaultConcurrency = 1; // By default, Langflow has only 1 worker available
  const concurrentRequests = process.env.LANGFLOW_WORKERS;
  const parsedConcurrency = concurrentRequests
    ? parseInt(concurrentRequests, 10)
    : defaultConcurrency;
  const concurrencyLimit =
    Number.isNaN(parsedConcurrency) || parsedConcurrency <= 0
      ? defaultConcurrency
      : parsedConcurrency;

  // Create a limit using `p-limit`
  const limit = pLimit(concurrencyLimit);

  // Create the metadata list as required
  const metadataList = [{ conversation_name: collectionName }, ...labels];

  await Promise.all(
    files.map((file) =>
      limit(async () => {
        const relativePath =
          file.webkitRelativePath || file.originalFilename || file.newFilename;
        // **Updated Line:** Include `collectionName` in the file path
        const filePath = path
          .posix
          .join(langflowCollectionPath, collectionName, relativePath.replace(/\\/g, '/'));
        const sessionId = uuidv4();

        const payload = {
          session_id: sessionId,
          tweaks: {
            'Server File Loader': {
              path: filePath,
              metadata: metadataList,
            },
          },
        };

        console.log(`Starting processing for: ${relativePath}`);

        // Update progress: add to processingFiles
        updateProgress(uploadId, {
          processingFiles: [relativePath],
        });

        try {
          await axios.post(apiUrl, payload, {
            headers: {
              'Content-Type': 'application/json',
            },
          });
          // console.log(`Successfully processed file: ${filePath}`, response.data);
        } catch (error) {
          if (axios.isAxiosError(error)) {
            console.error(`Error processing file: ${filePath}`, error.response?.data || error.message);
          } else {
            console.error(`Error processing file: ${filePath}`, error);
          }
        } finally {
          // Update progress: remove from processingFiles and increment processedFiles
          updateProgress(uploadId, {
            processedFilesIncrement: 1,
            processingFilesRemove: [relativePath],
          });
          console.log(`Finished processing for: ${relativePath}`);
        }
      })
    )
  );
}

// Update progress in the store
function updateProgress(
  uploadId: string,
  updates: {
    processedFilesIncrement?: number;
    processingFiles?: string[];
    processingFilesRemove?: string[];
  }
) {
  const progress = progressStore.get(uploadId);
  if (!progress) {
    console.log(`Cannot update progress: Upload ID ${uploadId} not found.`);
    return;
  }

  const updated = { ...progress };

  if (updates.processedFilesIncrement) {
    updated.processedFiles += updates.processedFilesIncrement;
  }

  if (updates.processingFiles) {
    updated.processingFiles.push(...updates.processingFiles);
  }

  if (updates.processingFilesRemove) {
    updated.processingFiles = updated.processingFiles.filter(
      (file) => !updates.processingFilesRemove?.includes(file)
    );
  }

  // Ensure processedFiles does not exceed totalFiles
  if (updated.processedFiles > updated.totalFiles) {
    updated.processedFiles = updated.totalFiles;
  }

  // Optionally, you can set isComplete if all files are processed
  if (updated.processedFiles === updated.totalFiles) {
    updated.isComplete = true;
  }

  // Update the store
  progressStore.set(uploadId, updated);
  // console.log(`Updated progress for Upload ID ${uploadId}:`, updated);
}
