// pages/api/upload-files.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { IncomingForm, Fields, Files, File } from 'formidable';
import fs from 'fs';
import path from 'path';
import os from 'os';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import pLimit from 'p-limit';

// Disable Next.js body parsing, since we're handling it with `formidable`
export const config = {
  api: {
    bodyParser: false,
  },
};

// Use the local environment variable if defined, otherwise use the Docker variable
const nodeUploadDirectory = process.env.LOCAL_FILE_UPLOAD_DIRECTORY || process.env.FILE_UPLOAD_DIRECTORY || './data/uploads';
const langflowDownloadDirectory = process.env.FILE_UPLOAD_DIRECTORY || '/data-uploads';

// Normalize path for compatibility with Langflow (Linux paths)
const unixifyPath = (inputPath: string) => inputPath.replace(/\\/g, '/');

// Extend File type to include webkitRelativePath
interface FileWithRelativePath extends File {
  webkitRelativePath?: string;
}

export default async function handleFileUpload(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, message: `Method ${req.method} Not Allowed` });
  }

  try {
    console.log('Starting file upload handling');

    const { fields, files } = await parseForm(req);

    const collectionName = extractField(fields, 'collectionName');
    const labels = extractLabels(fields);

    if (!collectionName) {
      return res.status(400).json({ success: false, message: 'Collection name is required.' });
    }

    // Use the Node.js-specific path for handling the upload locally
    const collectionPath = path.join(nodeUploadDirectory, collectionName);
    if (fs.existsSync(collectionPath)) {
      return res.status(409).json({ success: false, message: 'Collection already exists.' });
    }

    fs.mkdirSync(collectionPath, { recursive: true });
    console.log('Created collection directory:', collectionPath);

    const uploadedFiles = Array.isArray(files.files) ? files.files : [files.files];
    const validFiles = uploadedFiles.filter((file): file is FileWithRelativePath => file !== undefined);

    handleFiles(validFiles, collectionPath);
    saveMetadata(collectionPath, labels);

    // Use the Langflow-specific path when making API requests to ensure compatibility
    const langflowCollectionPath = path.join(langflowDownloadDirectory, collectionName);
    await processFiles(validFiles, unixifyPath(langflowCollectionPath), collectionName, labels);

    console.log('File upload handling completed successfully.');
    return res.status(200).json({ success: true, message: 'Files uploaded and processed successfully.' });
  } catch (error) {
    console.error('Error processing file upload:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'An unknown error occurred.',
    });
  }
}

// Parse the incoming form data
async function parseForm(req: NextApiRequest): Promise<{ fields: Fields; files: Files }> {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({ multiples: true, keepExtensions: true });
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      resolve({ fields, files });
    });
  });
}

// Extract a specific field from the form data
function extractField(fields: Fields, fieldName: string): string | undefined {
  const value = fields[fieldName];
  return Array.isArray(value) ? value[0] : value;
}

// Extract labels from the form data
// Extract labels from the form data
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

// Handle file copying to the correct destination
function handleFiles(files: FileWithRelativePath[], collectionPath: string) {
  files.forEach((file) => {
    const relativePath = file.webkitRelativePath || file.originalFilename || file.newFilename;
    const isPartOfDirectory = relativePath.includes('/');
    const destinationPath = isPartOfDirectory
      ? path.join(collectionPath, relativePath)
      : path.join(collectionPath, path.basename(relativePath));

    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.copyFileSync(file.filepath, destinationPath);
    console.log('Copied file to:', destinationPath);
  });
}

// Save metadata to the collection path
function saveMetadata(collectionPath: string, labels: object) {
  const metadataPath = path.join(collectionPath, '.metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(labels, null, 2));
  console.log('Metadata saved to:', metadataPath);
}

// Process files with external API call
async function processFiles(
  files: FileWithRelativePath[],
  langflowCollectionPath: string,
  collectionName: string,
  labels: { [key: string]: string }[]
) {
  const apiUrl = 'http://localhost:7860/api/v1/run/server-file-loader';

  // Manage number of concurrent requests to Langflow
  const cpuCount = os.cpus().length;
  const defaultConcurrency = Math.max(1, Math.floor(cpuCount / 2));
  const concurrentRequests = process.env.CONCURRENT_REQUESTS_TO_LANGFLOW;
  const parsedConcurrency = concurrentRequests ? parseInt(concurrentRequests, 10) : defaultConcurrency;
  const concurrencyLimit = Number.isNaN(parsedConcurrency) || parsedConcurrency <= 0
    ? defaultConcurrency
    : parsedConcurrency;

  // Create the limit using `p-limit`
  const limit = pLimit(concurrencyLimit);

  // Create the metadata list as required
  const metadataList = [{ conversation_name: collectionName }, ...labels];

  await Promise.all(
    files.map((file) => limit(async () => {
      const relativePath = file.webkitRelativePath || file.originalFilename || file.newFilename;
      const filePath = path.posix.join(langflowCollectionPath, relativePath.replace(/\\/g, '/'));
      const sessionId = uuidv4();

      const payload = {
        session_id: sessionId,
        tweaks: {
          "Server File Loader": {
            path: filePath,
            metadata: metadataList,
          },
        },
      };

      try {
        const response = await axios.post(apiUrl, payload, {
          headers: {
            'Content-Type': 'application/json',
          },
        });
        console.log(`Successfully processed file: ${filePath}`, response.data);
      } catch (error) {
          if (error instanceof Error) {
            console.error(`Error processing file: ${filePath}`, error.message);
          } else {
            console.error(`Error processing file: ${filePath}`, error);
          }
      }
    }))
  );
}
